/** Keep in sync with `@media (max-width: 640px)` in renderer CSS. */
export const NARROW_BREAKPOINT = 640;

export function shouldStackWindows(viewportWidth: number): boolean {
  return viewportWidth <= NARROW_BREAKPOINT;
}
