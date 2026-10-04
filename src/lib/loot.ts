import { z } from "zod";
import { evalFormula, rollValue } from "./rules/formula";
import { COINS, type Coin } from "./rules/constants";

// Loot tables: weighted rows that give a library item, a random item from a
// library folder, coins, a roll on another table, or nothing. Rolling makes a
// draft the GM hands out to characters, the party stash or splits evenly.

export const LOOT_ROW_KINDS = ["item", "folder", "coins", "table", "nothing"] as const;
export type LootRowKind = (typeof LOOT_ROW_KINDS)[number];

export const LOOT_ROW_LABELS: Record<LootRowKind, string> = {
  item: "Предмет из библиотеки",
  folder: "Случайный предмет из папки",
  coins: "Монеты",
  table: "Бросок по другой таблице",
  nothing: "Ничего",
};

export const LootRowSchema = z.object({
  id: z.string().min(1).max(40),
  weight: z.number().int().min(1).max(1000).default(1),
  kind: z.enum(LOOT_ROW_KINDS).default("nothing"),
  templateId: z.string().max(80).default(""),
  folder: z.string().max(100).default(""),
  tableId: z.string().max(80).default(""),
  /** Item quantity, or how many times to roll the other table: a dice formula. */
  quantity: z.string().max(100).default("1"),
  coin: z.enum(COINS).default("gp"),
  amount: z.string().max(100).default("1d6"),
  /** Chance in percent that a rolled item is cursed. */
  curseChance: z.number().min(0).max(100).default(0),
});
export type LootRow = z.infer<typeof LootRowSchema>;

export const LootTableInputSchema = z.object({
  name: z.string().trim().min(1, "Нужно название").max(200),
  folder: z.string().max(100).default(""),
  rolls: z.string().max(100).default("1"),
  rows: z.array(LootRowSchema).max(300).default([]),
});
export type LootTableInput = z.infer<typeof LootTableInputSchema>;
export type LootTableRow = LootTableInput & { id: string; updatedAt: string };

export const LootItemSchema = z.object({
  id: z.string().min(1).max(40),
  templateId: z.string().max(80),
  name: z.string().max(300),
  quantity: z.number().int().min(0).max(1_000_000),
  cursed: z.boolean().default(false),
  /** "" = not decided yet, "stash", or a character id. */
  assignee: z.string().max(80).default(""),
});
export type LootItem = z.infer<typeof LootItemSchema>;

const CoinsSchema = z.object({
  cp: z.number().default(0),
  sp: z.number().default(0),
  ep: z.number().default(0),
  gp: z.number().default(0),
  pp: z.number().default(0),
});

export const LootDataSchema = z.object({
  items: z.array(LootItemSchema).max(500).default([]),
  coins: CoinsSchema.prefault({}),
  log: z.array(z.string().max(500)).max(500).default([]),
  reason: z.string().max(300).default(""),
});
export type LootData = z.infer<typeof LootDataSchema>;

export type LootDraftRow = { id: string; title: string; status: string; data: LootData; createdAt: string };

type TemplateLite = { id: string; name: string; folder: string; kind: string };
type Rng = () => number;

/** Rolls a dice formula ("2d6*10"); 0 with a log line when it does not parse. */
export function rollAmount(formula: string, rng: Rng, log: string[]): number {
  const r = evalFormula(formula || "0", () => undefined);
  if (!r.ok) {
    log.push(`Формула «${formula}» не считается: ${r.error}`);
    return 0;
  }
  return Math.max(0, Math.floor(rollValue(r.value, rng).total));
}

function pickRow(rows: LootRow[], rng: Rng): LootRow | null {
  const total = rows.reduce((a, r) => a + r.weight, 0);
  if (!total) return null;
  let x = rng() * total;
  for (const r of rows) {
    x -= r.weight;
    if (x < 0) return r;
  }
  return rows[rows.length - 1];
}

let counter = 0;
const lootId = () => `li_${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function emptyLoot(): LootData {
  return LootDataSchema.parse({});
}

/** Adds the result of rolling `table` (its own number of rolls) to `out`. */
export function rollTable(
  table: Pick<LootTableInput, "name" | "rolls" | "rows">,
  ctx: { tables: Map<string, Pick<LootTableInput, "name" | "rolls" | "rows">>; templates: TemplateLite[]; rng?: Rng },
  out: LootData = emptyLoot(),
  depth = 0,
  times?: number,
): LootData {
  const rng = ctx.rng ?? Math.random;
  if (depth > 5) {
    out.log.push(`«${table.name}»: слишком глубокая вложенность таблиц, бросок пропущен`);
    return out;
  }
  const n = times ?? rollAmount(table.rolls, rng, out.log);
  const indent = "  ".repeat(depth);
  for (let i = 0; i < n; i++) {
    const row = pickRow(table.rows, rng);
    if (!row || row.kind === "nothing") {
      out.log.push(`${indent}«${table.name}»: ничего`);
      continue;
    }
    if (row.kind === "coins") {
      const amount = rollAmount(row.amount, rng, out.log);
      out.coins[row.coin as Coin] += amount;
      out.log.push(`${indent}«${table.name}»: ${amount} ${row.coin} (${row.amount})`);
      continue;
    }
    if (row.kind === "table") {
      const sub = ctx.tables.get(row.tableId);
      if (!sub) {
        out.log.push(`${indent}«${table.name}»: таблица не найдена`);
        continue;
      }
      const subTimes = rollAmount(row.quantity, rng, out.log);
      out.log.push(`${indent}«${table.name}» → «${sub.name}» ×${subTimes}`);
      rollTable(sub, ctx, out, depth + 1, subTimes);
      continue;
    }
    let tpl: TemplateLite | undefined;
    if (row.kind === "item") tpl = ctx.templates.find((t) => t.id === row.templateId && t.kind === "item");
    else {
      const inFolder = ctx.templates.filter((t) => t.kind === "item" && t.folder === row.folder);
      tpl = inFolder.length ? inFolder[Math.floor(rng() * inFolder.length)] : undefined;
    }
    if (!tpl) {
      out.log.push(`${indent}«${table.name}»: ${row.kind === "item" ? "предмет удалён из библиотеки" : `в папке «${row.folder}» нет предметов`}`);
      continue;
    }
    const quantity = Math.max(1, rollAmount(row.quantity, rng, out.log));
    const cursed = row.curseChance > 0 && rng() * 100 < row.curseChance;
    out.items.push({ id: lootId(), templateId: tpl.id, name: tpl.name, quantity, cursed, assignee: "" });
    out.log.push(`${indent}«${table.name}»: ${tpl.name} ×${quantity}${cursed ? " (проклят)" : ""}`);
  }
  return out;
}

/** Even split of coins between `n` characters; the remainder stays in the stash. */
export function splitCoins(coins: Record<Coin, number>, n: number): { each: Record<Coin, number>; rest: Record<Coin, number> } {
  const each = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } as Record<Coin, number>;
  const rest = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } as Record<Coin, number>;
  for (const c of COINS) {
    each[c] = n > 0 ? Math.floor(coins[c] / n) : 0;
    rest[c] = coins[c] - each[c] * n;
  }
  return { each, rest };
}

const row = (weight: number, coin: Coin, amount: string): LootRow => ({
  id: `r${coin}${weight}${amount.length}`,
  weight,
  kind: "coins",
  coin,
  amount,
  templateId: "",
  folder: "",
  tableId: "",
  quantity: "1",
  curseChance: 0,
});

/** Starter tables: pocket money of one creature by challenge rating. */
export const STARTER_TABLES: LootTableInput[] = [
  {
    name: "Карманы: опасность 0–4",
    folder: "Стартовые",
    rolls: "1",
    rows: [row(30, "cp", "5d6"), row(30, "sp", "4d6"), row(10, "ep", "3d6"), row(25, "gp", "3d6"), row(5, "pp", "1d6")],
  },
  {
    name: "Карманы: опасность 5–10",
    folder: "Стартовые",
    rolls: "1",
    rows: [row(30, "cp", "4d6*100"), row(30, "sp", "6d6*10"), row(10, "ep", "3d6*10"), row(25, "gp", "4d6*10"), row(5, "pp", "2d6*10")],
  },
  {
    name: "Карманы: опасность 11–16",
    folder: "Стартовые",
    rolls: "1",
    rows: [row(20, "sp", "4d6*100"), row(15, "ep", "1d6*100"), row(40, "gp", "2d6*100"), row(25, "pp", "2d6*10")],
  },
  {
    name: "Карманы: опасность 17+",
    folder: "Стартовые",
    rolls: "1",
    rows: [row(15, "ep", "2d6*1000"), row(55, "gp", "8d6*100"), row(30, "pp", "1d6*100")],
  },
];
