/** Pure helpers for Life SVG theme bake (testable without DOM capture). */

export type ThemeSvgPalette = {
  card: string;
  border: string;
  accent: string;
  muted: string;
  run: string;
  special2: string;
};

/** Map a hardcoded SVG fill to the live theme palette. Returns null if unchanged. */
export function mapHardcodedSvgFill(
  raw: string,
  palette: ThemeSvgPalette
): string | null {
  const key = raw.trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  const fillMap: Record<string, string> = {
    '#222222': palette.card,
    '#222': palette.card,
    '#1a1a1a': palette.card,
    '#444444': palette.border,
    '#444': palette.border,
    '#555555': palette.border,
    '#4dd2ff': palette.accent,
  };
  if (fillMap[key]) return fillMap[key];
  if (fillMap[lower]) return fillMap[lower];
  if (key === 'yellow' || lower === '#ffff00') return palette.run;
  if (key === 'red' || lower === '#ff0000') return palette.special2;
  if (key === 'gray' || key === 'grey') return palette.muted;
  return null;
}
