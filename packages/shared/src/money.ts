export function formatCents(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents)) {
    throw new RangeError("amountCents must be a safe integer");
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(amountCents / 100);
}

export function parseEuroCents(value: string): number | null {
  const match = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;

  const wholeEuros = Number(match[2]);
  const fraction = Number((match[3] ?? "").padEnd(2, "0"));
  const absoluteCents = wholeEuros * 100 + fraction;
  if (!Number.isSafeInteger(absoluteCents)) return null;
  return match[1] === "-" ? -absoluteCents : absoluteCents;
}
