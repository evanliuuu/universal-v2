export type ThemeId = "cupertino" | "dark" | "win95";

const BASE = `
  --uw-bg: linear-gradient(135deg, #1a6fa8 0%, #4aadce 50%, #87ceeb 100%);
  --uw-menubar-bg: rgba(255,255,255,0.72);
  --uw-dock-bg: rgba(255,255,255,0.75);
  --uw-window-bg: #ffffff;
  --uw-titlebar-bg: #f0f0f0;
  --uw-text: #111111;
  --uw-accent: #007aff;
  --uw-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const THEMES: Record<ThemeId, string> = {
  cupertino: BASE,
  dark: `
  --uw-bg: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #21262d 100%);
  --uw-menubar-bg: rgba(30,30,30,0.85);
  --uw-dock-bg: rgba(40,40,40,0.9);
  --uw-window-bg: #1e1e1e;
  --uw-titlebar-bg: #2d2d2d;
  --uw-text: #e6edf3;
  --uw-accent: #58a6ff;
  --uw-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`,
  win95: `
  --uw-bg: #008080;
  --uw-menubar-bg: #c0c0c0;
  --uw-dock-bg: #c0c0c0;
  --uw-window-bg: #c0c0c0;
  --uw-titlebar-bg: #000080;
  --uw-text: #000000;
  --uw-accent: #000080;
  --uw-font: "MS Sans Serif", Tahoma, sans-serif;
`,
};

export function themeVariables(theme: string): string {
  const id = (theme in THEMES ? theme : "cupertino") as ThemeId;
  return `:root { ${THEMES[id]} }`;
}

export function normalizeTheme(theme: string): ThemeId {
  if (theme === "dark" || theme === "win95") return theme;
  return "cupertino";
}
