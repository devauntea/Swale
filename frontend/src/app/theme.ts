/** A presentation preference only: never part of the fixture or map state. */
export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "swale.theme";

export function parseTheme(value: unknown): Theme {
  return value === "dark" ? "dark" : "light";
}

export function storeTheme(
  theme: Theme,
  storage: Pick<Storage, "setItem">,
): boolean {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    // The current session still works when browser storage is unavailable.
    return false;
  }
}
