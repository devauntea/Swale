import type { Map } from "maplibre-gl";
import type { Theme } from "../app/theme";

type Point = readonly [number, number];
interface Glyph {
  lines: readonly (readonly Point[])[];
  circles?: readonly (readonly [number, number, number])[];
}

/**
 * Original, local pictograms for the seven class IDs absent from the inspected
 * Liberty sprite index. Each glyph depicts its class; these are not blank images
 * or generic warning-swallowing placeholders. Coordinates use a 24px artboard.
 */
export const LOCAL_BASEMAP_GLYPHS = {
  sailing: {
    lines: [
      [
        [12, 3],
        [12, 17],
      ],
      [
        [11, 4],
        [4, 14],
        [11, 14],
        [11, 4],
      ],
      [
        [14, 7],
        [20, 14],
        [14, 14],
        [14, 7],
      ],
      [
        [3, 17],
        [6, 20],
        [18, 20],
        [21, 17],
        [3, 17],
      ],
    ],
  },
  running: {
    circles: [[14, 4, 1.6]],
    lines: [
      [
        [6, 9],
        [10, 7],
        [14, 10],
        [19, 10],
      ],
      [
        [11, 8],
        [10, 14],
        [15, 17],
        [17, 21],
      ],
      [
        [10, 14],
        [7, 18],
        [3, 18],
      ],
    ],
  },
  gate: {
    lines: [
      [
        [3, 5],
        [3, 21],
      ],
      [
        [21, 5],
        [21, 21],
      ],
      [
        [3, 8],
        [21, 8],
        [21, 18],
        [3, 18],
      ],
      [
        [7, 8],
        [7, 18],
      ],
      [
        [12, 8],
        [12, 18],
      ],
      [
        [17, 8],
        [17, 18],
      ],
    ],
  },
  ferry_terminal: {
    lines: [
      [
        [4, 11],
        [4, 4],
        [10, 4],
        [10, 11],
      ],
      [
        [3, 11],
        [21, 11],
        [18, 17],
        [6, 17],
        [3, 11],
      ],
      [
        [13, 11],
        [13, 7],
        [18, 7],
        [18, 11],
      ],
      [
        [2, 20],
        [6, 21],
        [10, 20],
        [14, 21],
        [18, 20],
        [22, 21],
      ],
    ],
  },
  bicycle_parking: {
    circles: [
      [5, 17, 3],
      [18, 17, 3],
    ],
    lines: [
      [
        [5, 17],
        [9, 10],
        [14, 17],
        [5, 17],
      ],
      [
        [9, 10],
        [16, 10],
        [18, 17],
      ],
      [
        [8, 8],
        [11, 8],
      ],
      [
        [16, 10],
        [15, 7],
        [18, 7],
      ],
      [
        [3, 8],
        [3, 2],
        [6, 2],
        [7, 3],
        [6, 5],
        [3, 5],
      ],
    ],
  },
  brownfield: {
    lines: [
      [
        [3, 20],
        [3, 12],
        [8, 9],
        [8, 12],
        [13, 9],
        [13, 13],
        [20, 13],
        [20, 20],
        [3, 20],
      ],
      [
        [16, 13],
        [16, 5],
        [19, 5],
        [19, 13],
      ],
      [
        [5, 22],
        [10, 21],
        [13, 23],
        [19, 21],
      ],
      [
        [6, 16],
        [8, 16],
      ],
      [
        [11, 16],
        [13, 16],
      ],
      [
        [16, 16],
        [18, 16],
      ],
    ],
  },
  office: {
    lines: [
      [
        [5, 21],
        [5, 3],
        [19, 3],
        [19, 21],
        [5, 21],
      ],
      [
        [9, 6],
        [9, 8],
      ],
      [
        [15, 6],
        [15, 8],
      ],
      [
        [9, 11],
        [9, 13],
      ],
      [
        [15, 11],
        [15, 13],
      ],
      [
        [10, 21],
        [10, 17],
        [14, 17],
        [14, 21],
      ],
    ],
  },
} as const satisfies Record<string, Glyph>;

export type LocalBasemapGlyphId = keyof typeof LOCAL_BASEMAP_GLYPHS;
export const LOCAL_BASEMAP_GLYPH_IDS = Object.keys(
  LOCAL_BASEMAP_GLYPHS,
) as LocalBasemapGlyphId[];

function distanceToSegment(x: number, y: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared),
        );
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

/** Pure local vector rasterizer: no fetch, DOM, image decoder or extra dependency. */
export function createLocalBasemapGlyph(id: string, theme: Theme) {
  if (!Object.prototype.hasOwnProperty.call(LOCAL_BASEMAP_GLYPHS, id))
    return null;
  const glyph: Glyph = LOCAL_BASEMAP_GLYPHS[id as LocalBasemapGlyphId];
  const width = 48;
  const data = new Uint8Array(width * width * 4);
  const color = theme === "dark" ? [157, 203, 255] : [50, 100, 164];
  for (let py = 0; py < width; py++) {
    for (let px = 0; px < width; px++) {
      let coverage = 0;
      // Four samples preserve small curved strokes when MapLibre downsizes 2x art.
      for (const sx of [0.25, 0.75]) {
        for (const sy of [0.25, 0.75]) {
          const x = (px + sx) / 2;
          const y = (py + sy) / 2;
          const inLine = glyph.lines.some((line) =>
            line
              .slice(1)
              .some(
                (end, index) =>
                  distanceToSegment(x, y, line[index], end) <= 0.8,
              ),
          );
          const inCircle = glyph.circles?.some(
            ([cx, cy, radius]) =>
              Math.abs(Math.hypot(x - cx, y - cy) - radius) <= 0.75,
          );
          if (inLine || inCircle) coverage++;
        }
      }
      if (coverage) {
        const offset = (py * width + px) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = Math.round((coverage / 4) * 255);
      }
    }
  }
  return { width, height: width, data };
}

/** MapLibre v6 awaits this resolver before reporting a symbol as missing. */
export function installLocalBasemapGlyphs(map: Map, getTheme: () => Theme) {
  const registered = new Set<string>();
  map.setMissingStyleImageResolver((id) => {
    if (map.hasImage(id)) return;
    const image = createLocalBasemapGlyph(id, getTheme());
    if (!image) return; // Unknown IDs remain genuine visible/console warnings.
    map.addImage(id, image, { pixelRatio: 2 });
    registered.add(id);
  });
  return {
    updateTheme(theme: Theme) {
      for (const id of registered) {
        const image = createLocalBasemapGlyph(id, theme);
        if (image && map.hasImage(id)) map.updateImage(id, image);
      }
    },
    dispose() {
      map.setMissingStyleImageResolver(null);
      registered.clear();
    },
  };
}
