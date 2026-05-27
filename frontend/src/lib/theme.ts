export const THEME_STORAGE_KEY = "bakerypilot.theme";
export const ACCENT_STORAGE_KEY = "bakerypilot.accent";

export const THEMES = ["dark", "light"] as const;
export type ThemeMode = (typeof THEMES)[number];

export const ACCENTS = ["blue", "emerald", "violet", "amber"] as const;
export type AccentColor = (typeof ACCENTS)[number];

export const DEFAULT_THEME: ThemeMode = "dark";
export const DEFAULT_ACCENT: AccentColor = "blue";

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEMES.includes(value as ThemeMode);
}

export function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && ACCENTS.includes(value as AccentColor);
}
