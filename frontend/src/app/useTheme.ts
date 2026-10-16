import { useEffect, useLayoutEffect, useState } from "react";
import { parseTheme, storeTheme, THEME_STORAGE_KEY, type Theme } from "./theme";

export function useTheme() {
  // The synchronous head script already chose this value before the first paint.
  const [theme, setTheme] = useState<Theme>(() =>
    parseTheme(document.documentElement.dataset.theme),
  );
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document
      .querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
      ?.setAttribute("content", theme);
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0B1220" : "#F6F9FD");
    try {
      storeTheme(theme, window.localStorage);
    } catch {
      /* Storage may be disabled. */
    }
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null)
        setTheme(parseTheme(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return [theme, setTheme] as const;
}
