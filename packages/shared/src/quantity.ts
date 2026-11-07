export const quantityScale = 1_000_000_000;
export const minimumPositiveQuantity = 1 / quantityScale;
export const maximumQuantity = 9999;

export function isValidQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximumQuantity
    && Number(value.toFixed(9)) === value;
}

export function parseQuantity(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d{1,9})?|\.\d{1,9})$/.test(text)) return null;
  const value = Number(text);
  return isValidQuantity(value) ? value : null;
}

export function quantityUnits(value: number): number {
  return Math.round(value * quantityScale);
}

export function formatQuantity(value: number): string {
  if (!isValidQuantity(value)) return String(value);
  return value.toFixed(9).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
