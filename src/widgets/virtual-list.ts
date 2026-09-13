export const VIRTUALIZE_AFTER = 16;
export const VIRTUAL_WINDOW = 12;
export const VIRTUAL_ROW_PX = 36;

export type ListItem = { id?: string; label?: string } | string;

export function listItemId(item: ListItem): string {
  return typeof item === "string" ? "" : (item.id ?? "");
}

export function listItemLabel(item: ListItem): string {
  return typeof item === "string" ? item : (item.label ?? "");
}

export function shouldVirtualize(items: ListItem[]): boolean {
  return items.length > VIRTUALIZE_AFTER;
}

export function visibleSlice(
  items: ListItem[],
  start: number,
  windowSize = VIRTUAL_WINDOW,
): { start: number; items: ListItem[] } {
  const maxStart = Math.max(0, items.length - windowSize);
  const clamped = Math.max(0, Math.min(maxStart, Math.floor(start)));
  return { start: clamped, items: items.slice(clamped, clamped + windowSize) };
}

export function spacerPx(count: number, rowPx = VIRTUAL_ROW_PX): number {
  return Math.max(0, count) * rowPx;
}
