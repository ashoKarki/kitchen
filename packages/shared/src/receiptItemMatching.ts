import type { ItemWithId } from "./itemViews.js";
import type { ReceiptLineItem } from "./types.js";

function normalizedName(name: string): string {
  return name.normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim().split(/\s+/).map((word) =>
      word.length > 4 && word.endsWith("s") && !/(?:ss|us|is)$/.test(word)
        ? word.slice(0, -1) : word
    ).join(" ");
}

export function matchingReceiptItems(
  line: Pick<ReceiptLineItem, "name" | "amountCents" | "isDeposit" | "category">,
  items: readonly ItemWithId[]
): ItemWithId[] {
  if (line.isDeposit || line.category === "Deposit/Pfand" || line.amountCents < 0) return [];
  const name = normalizedName(line.name);
  if (name.length < 3) return [];
  return items.filter(({ item }) => {
    if (item.deletedAt) return false;
    const candidate = normalizedName(item.name);
    if (candidate.length < 3) return false;
    return name === candidate
      || ` ${name} `.includes(` ${candidate} `)
      || ` ${candidate} `.includes(` ${name} `);
  }).slice(0, 5);
}
