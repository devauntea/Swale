import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { parseTheme, storeTheme, THEME_STORAGE_KEY } from "../app/theme";
import { MAP_THEMES } from "../map/presentation";

const frontend = fileURLToPath(new URL("../../", import.meta.url));
const html = readFileSync(resolve(frontend, "index.html"), "utf8");
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1];

function boot(saved: unknown, denied = false) {
  const meta: Record<string, { content: string }> = {
    'meta[name="color-scheme"]': { content: "light" },
    'meta[name="theme-color"]': { content: "#F6F9FD" },
  };
  const root = { dataset: { theme: "light" }, style: { colorScheme: "light" } };
  // Executes only the pure startup script. No page, renderer or preview request.
  runInNewContext(bootstrap, {
    document: {
      documentElement: root,
      querySelector: (key: string) => meta[key],
    },
    localStorage: {
      getItem(key: string) {
        if (denied) throw new Error("Unavailable storage");
        expect(key).toBe(THEME_STORAGE_KEY);
        return saved;
      },
    },
  });
  return { root, meta };
}

describe("explicit persistent theme", () => {
  it.each([null, undefined, "invalid", "system", "LIGHT", {}, 0])(
    "defaults invalid/unset %s to light",
    (value) => {
      expect(parseTheme(value)).toBe("light");
      expect(boot(value).root.dataset.theme).toBe("light");
    },
  );
  it.each(["light", "dark"] as const)(
    "applies stored %s before the application module",
    (theme) => {
      const result = boot(theme);
      expect(result.root.dataset.theme).toBe(theme);
      expect(result.root.style.colorScheme).toBe(theme);
      expect(result.meta['meta[name="color-scheme"]'].content).toBe(theme);
      expect(html.indexOf(bootstrap)).toBeLessThan(
        html.indexOf('type="module"'),
      );
    },
  );
  it("keeps first-time light when storage throws", () => {
    expect(boot("dark", true).root.dataset.theme).toBe("light");
  });
  it("stores a preference and reads it back without changing its meaning", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    for (const theme of ["dark", "light"] as const) {
      expect(storeTheme(theme, storage)).toBe(true);
      expect(parseTheme(storage.getItem(THEME_STORAGE_KEY))).toBe(theme);
    }
    expect(
      storeTheme("dark", {
        setItem() {
          throw new Error("denied");
        },
      }),
    ).toBe(false);
  });
});

const css = readFileSync(resolve(frontend, "src/styles/themes.css"), "utf8");
function tokens(section: string) {
  return Object.fromEntries(
    [...section.matchAll(/(--[\w-]+):\s*(#[\da-f]{6,8});/gi)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}
const light = tokens(css.split(':root[data-theme="dark"]')[0]);
const palettes = {
  light,
  dark: { ...light, ...tokens(css.split(':root[data-theme="dark"]')[1]) },
};
function channels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function luminance(hex: string) {
  const c = channels(hex).map((value) => {
    const n = value / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string) {
  const [lower, upper] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (upper + 0.05) / (lower + 0.05);
}

describe("design palette contracts (not rendered acceptance)", () => {
  for (const theme of ["light", "dark"] as const) {
    const palette = palettes[theme];
    it(`${theme} text/action pairs meet 4.5:1 numerical contrast`, () => {
      for (const [foreground, background] of [
        ["--text", "--surface"],
        ["--text-secondary", "--surface"],
        ["--text-secondary", "--surface-elevated"],
        ["--text-secondary", "--accent-soft"],
        ["--on-accent", "--accent"],
        ["--low-band-label", "--low"],
        ["--band-label", "--elevated"],
        ["--band-label", "--high"],
        ["--sidebar-text", "--sidebar-surface"],
        ["--sidebar-muted", "--sidebar-elevated"],
        ["--sidebar-accent", "--sidebar-selected"],
      ])
        expect(
          contrast(palette[foreground], palette[background]),
          `${theme} ${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme} legend swatches match actual map priorities and complaint colors`, () => {
      for (const band of ["low", "moderate", "elevated", "high"] as const)
        expect(channels(palette[`--${band}`])).toEqual(
          MAP_THEMES[theme].priority[band].slice(0, 3),
        );
      expect(channels(palette["--complaint"])).toEqual(
        MAP_THEMES[theme].complaint.slice(0, 3),
      );
    });
  }
  it("reserves yellow literals for the mascot and the verified MTA service palette", () => {
    const visit = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() && entry.name !== "tests"
          ? visit(resolve(dir, entry.name))
          : entry.isFile() &&
              /\.(css|ts|tsx|svg)$/.test(entry.name) &&
              entry.name !== "SwaleMascot.tsx"
            ? [resolve(dir, entry.name)]
            : [],
      );
    for (const file of [
      ...visit(resolve(frontend, "src")),
      ...visit(resolve(frontend, "public")),
    ]) {
      for (const match of readFileSync(file, "utf8").matchAll(
        /#[\da-f]{6}(?:[\da-f]{2})?\b/gi,
      )) {
        if (
          file.endsWith("/map/servicePalette.ts") &&
          ["#F6BC26", "#EB6800", "#799534"].includes(match[0].toUpperCase())
        )
          continue;
        const [r, g, b] = channels(match[0]);
        // Saturated yellow/amber: strong red+green and substantially less blue.
        expect(
          r > 130 && g > 95 && Math.min(r, g) - b > 40,
          `${file}: ${match[0]}`,
        ).toBe(false);
      }
    }
  });
});
