import { z } from "zod";
import { COINS, COIN_LABELS, type Coin } from "./rules/constants";

// Merchants: library items with a price; paying takes coins from the sheet
// and gives change, like at a real counter.

export const ShopItemSchema = z.object({
  id: z.string().min(1).max(40),
  templateId: z.string().max(80),
  name: z.string().max(300).default(""),
  price: z.number().min(0).max(10_000_000),
  coin: z.enum(COINS).default("gp"),
  /** null = unlimited. */
  stock: z.number().int().min(0).max(100000).nullable().default(null),
});
export type ShopItem = z.infer<typeof ShopItemSchema>;

export const ShopInputSchema = z.object({
  name: z.string().trim().min(1, "Нужно название").max(200),
  description: z.string().max(5000).default(""),
  open: z.boolean().default(false),
  items: z.array(ShopItemSchema).max(500).default([]),
});
export type ShopInput = z.infer<typeof ShopInputSchema>;
export type ShopRow = ShopInput & { id: string };

export const BuySchema = z.object({
  itemId: z.string().max(40),
  characterId: z.string().max(80),
  quantity: z.number().int().min(1).max(1000).default(1),
});

/** Value of each coin in copper. */
const IN_CP: Record<Coin, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

/** Coins given as change, biggest first. */
const CHANGE: Coin[] = ["pp", "gp", "sp", "cp"];

export function priceInCp(price: number, coin: Coin): number {
  return Math.round(price * IN_CP[coin]);
}

export function formatPrice(price: number, coin: Coin): string {
  return `${price.toLocaleString("ru")} ${COIN_LABELS[coin].short}`;
}

/**
 * Pays `cost` copper from a purse: spends the smallest coins first, breaks one
 * bigger coin when needed and returns the change in the biggest coins that fit
 * (no electrum: merchants rarely hand it out).
 * Returns the new purse, or null when there is not enough money.
 */
export function payCoins(purse: Record<Coin, number>, cost: number): Record<Coin, number> | null {
  const total = COINS.reduce((a, c) => a + purse[c] * IN_CP[c], 0);
  if (total < cost) return null;
  const next = { ...purse };
  let left = cost;
  // Small coins first, as many as are useful.
  for (const c of COINS) {
    const use = Math.min(next[c], Math.floor(left / IN_CP[c]));
    next[c] -= use;
    left -= use * IN_CP[c];
  }
  if (left > 0) {
    // Break the smallest coin that covers the rest and take change.
    const c = COINS.find((x) => next[x] > 0 && IN_CP[x] >= left);
    if (!c) {
      // Several small coins left over can still cover it: pay from the total.
      let remaining = COINS.reduce((a, x) => a + next[x] * IN_CP[x], 0) - left;
      next.ep = 0;
      for (const x of CHANGE) {
        next[x] = Math.floor(remaining / IN_CP[x]);
        remaining -= next[x] * IN_CP[x];
      }
      return next;
    }
    next[c] -= 1;
    let change = IN_CP[c] - left;
    for (const x of CHANGE) {
      if (IN_CP[x] >= IN_CP[c]) continue;
      const n = Math.floor(change / IN_CP[x]);
      next[x] += n;
      change -= n * IN_CP[x];
    }
  }
  return next;
}
