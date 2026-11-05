/** Localize Month-of-Life SVG title age segment baked in as "(N years old)". */
export function localizeMolTitle(
  raw: string,
  yearsOldTemplate: string
): string {
  return raw.replace(/\((\d+)\s+years?\s+old\)/gi, (_m, n: string) => {
    const label = yearsOldTemplate.replace(/\{n\}/g, n);
    return `(${label})`;
  });
}
