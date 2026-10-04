import { z } from "zod";
import { CONDITIONS } from "@/lib/rules/conditions";
import {
  CounterSchema,
  EffectSchema,
  FeatureSchema,
  GRANT_EXPIRY,
  GRANT_LOCKS,
  GRANT_VISIBILITY,
  ItemSchema,
  type Counter,
  type Feature,
  type GrantExpiry,
  type GrantLock,
  type GrantVisibility,
  type Item,
} from "@/lib/rules/schema";

// GM library templates and grants: shared rules for the server and the UI.

export const TEMPLATE_KINDS = ["item", "feature", "counter"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  item: "Предмет",
  feature: "Особенность",
  counter: "Счётчик",
};

/** A curse or boon stage: replaces the effects of the granted feature. */
export const StageSchema = z.object({
  name: z.string().max(200).default(""),
  effects: z.array(EffectSchema).max(200).default([]),
});
export type Stage = z.infer<typeof StageSchema>;

/** Template bodies from files or scripts may come without an id; copies get their own anyway. */
const withId = (v: unknown) => (v && typeof v === "object" && !("id" in v) ? { ...v, id: "template" } : v);

export const TemplateObjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("item"), body: z.preprocess(withId, ItemSchema) }),
  z.object({ kind: z.literal("feature"), body: z.preprocess(withId, FeatureSchema) }),
  z.object({ kind: z.literal("counter"), body: z.preprocess(withId, CounterSchema) }),
]);
export type TemplateObject = z.infer<typeof TemplateObjectSchema>;

export const TemplateInputSchema = z.intersection(
  TemplateObjectSchema,
  z.object({
    folder: z.string().max(100).default(""),
    tags: z.array(z.string().max(50)).max(30).default([]),
    stages: z.array(StageSchema).max(20).default([]),
  }),
);
export type TemplateInput = z.input<typeof TemplateInputSchema>;

export type TemplateRow = {
  id: string;
  kind: TemplateKind;
  name: string;
  folder: string;
  tags: string[];
  body: Item | Feature | Counter;
  stages: Stage[];
  /** Active grants made from this template. */
  activeGrants: number;
  updatedAt: string;
};

export function templateName(obj: TemplateObject): string {
  return obj.body.name.trim() || TEMPLATE_KIND_LABELS[obj.kind];
}

/** Library export file. */
export const LibraryFileSchema = z.object({
  format: z.literal("dnd-web-library"),
  version: z.literal(1),
  templates: z.array(TemplateInputSchema).max(2000),
});

export const LOCK_LABELS: Record<GrantLock, string> = {
  none: "Игрок может всё",
  noedit: "Нельзя менять",
  noremove: "Нельзя менять и убрать",
};

export const VISIBILITY_LABELS: Record<GrantVisibility, string> = {
  visible: "Видно всё",
  masked: "Видно имя, свойства «???»",
  hidden: "Полностью скрыто",
};

export const EXPIRY_LABELS: Record<GrantExpiry, string> = {
  never: "Навсегда",
  rounds: "N раундов боя",
  short: "До отдыха",
  long: "До длинного отдыха",
  days: "N дней (длинных отдыхов)",
  session: "До конца сессии",
};

export const GRANT_STATUSES = ["offered", "active", "removed", "declined", "detached"] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  offered: "Предложено",
  active: "Действует",
  removed: "Снято",
  declined: "Отклонено",
  detached: "Персонаж ушёл",
};

export const GrantInputSchema = z
  .object({
    characterIds: z.array(z.string().min(1).max(80)).min(1, "Выберите, кому").max(50),
    templateId: z.string().max(80).optional(),
    /** Ad-hoc object when there is no template. */
    object: TemplateObjectSchema.optional(),
    stages: z.array(StageSchema).max(20).optional(),
    delivery: z.enum(["now", "offer"]).default("now"),
    lock: z.enum(GRANT_LOCKS).default("none"),
    visibility: z.enum(GRANT_VISIBILITY).default("visible"),
    expires: z.enum(GRANT_EXPIRY).default("never"),
    left: z.number().int().min(0).max(100000).default(0),
    removal: z.string().max(500).default(""),
    reason: z.string().trim().min(1, "Нужна причина: она попадёт в журнал").max(300),
    cursed: z.boolean().default(false),
    triggers: z.string().max(500).default(""),
    /** Mutations: body part, or "choice" to let the player pick when accepting. */
    bodyPart: z.string().max(50).optional(),
    quantity: z.number().min(0).max(1_000_000).optional(),
  })
  .refine((g) => !!g.templateId !== !!g.object, { message: "Нужен шаблон или объект" });
export type GrantInput = z.input<typeof GrantInputSchema>;

export const GrantPatchSchema = z.object({
  visibility: z.enum(GRANT_VISIBILITY).optional(),
  lock: z.enum(GRANT_LOCKS).optional(),
  removal: z.string().max(500).optional(),
  expires: z.enum(GRANT_EXPIRY).optional(),
  left: z.number().int().min(0).max(100000).optional(),
  stage: z.number().int().min(0).max(50).optional(),
  /** Remove the granted copy from the sheet. */
  remove: z.boolean().optional(),
  reason: z.string().max(300).default(""),
});

export const GrantResponseSchema = z.object({
  accept: z.boolean(),
  bodyPart: z.string().max(50).optional(),
});

export type GrantRow = {
  id: string;
  characterId: string;
  characterName: string;
  templateId: string | null;
  kind: TemplateKind;
  name: string;
  status: GrantStatus;
  lock: GrantLock;
  visibility: GrantVisibility;
  expires: GrantExpiry;
  left: number;
  removal: string;
  reason: string;
  stage: number;
  stages: number;
  /** Feature kind or item category, for icons. */
  subkind: string;
  bodyPart: string;
  createdAt: string;
  /** Full object, only for the GM and for visible offers. */
  payload: Item | Feature | Counter | null;
};

// ------------------------------------------------------------------ quick actions

export const QUICK_ACTIONS = ["damage", "heal", "temp", "condition", "uncondition", "exhaustion", "inspiration", "xp", "coins"] as const;

export const QuickActionSchema = z.object({
  characterIds: z.array(z.string().min(1).max(80)).min(1, "Выберите, кому").max(50),
  action: z.enum(QUICK_ACTIONS),
  /** Amount for numbers, condition id for conditions. */
  amount: z.number().min(-1_000_000).max(1_000_000).default(0),
  condition: z.string().max(60).default(""),
  coin: z.enum(["cp", "sp", "ep", "gp", "pp"]).default("gp"),
  reason: z.string().trim().min(1, "Нужна причина: она попадёт в журнал").max(300),
});
export type QuickAction = z.infer<typeof QuickActionSchema>;

export const QUICK_ACTION_LABELS: Record<(typeof QUICK_ACTIONS)[number], string> = {
  damage: "Урон",
  heal: "Лечение",
  temp: "Временные хиты",
  condition: "Наложить состояние",
  uncondition: "Снять состояние",
  exhaustion: "Истощение ±",
  inspiration: "Вдохновение ±",
  xp: "Опыт",
  coins: "Монеты ±",
};

export const CONDITION_OPTIONS = CONDITIONS.map((c) => ({ value: c.id, label: c.label }));

// ------------------------------------------------------------------ stash

export const StashActionSchema = z.discriminatedUnion("action", [
  /** Player or GM puts an item from a sheet into the stash. */
  z.object({ action: z.literal("put"), characterId: z.string().max(80), itemId: z.string().max(80), quantity: z.number().min(0).max(1_000_000).optional() }),
  /** Take an item from the stash into a sheet. */
  z.object({ action: z.literal("take"), characterId: z.string().max(80), stashId: z.string().max(80), quantity: z.number().min(0).max(1_000_000).optional() }),
  /** Hand an item from one sheet to another. */
  z.object({
    action: z.literal("give"),
    characterId: z.string().max(80),
    itemId: z.string().max(80),
    toCharacterId: z.string().max(80),
    quantity: z.number().min(0).max(1_000_000).optional(),
  }),
  /** Move coins between a sheet and the stash (positive = into the stash). */
  z.object({ action: z.literal("coins"), characterId: z.string().max(80), coin: z.enum(["cp", "sp", "ep", "gp", "pp"]), amount: z.number().int() }),
  /** GM adds an item from the library straight into the stash. */
  z.object({ action: z.literal("add"), templateId: z.string().max(80), quantity: z.number().min(0).max(1_000_000).optional() }),
  /** GM removes an item from the stash. */
  z.object({ action: z.literal("discard"), stashId: z.string().max(80) }),
]);
export type StashAction = z.infer<typeof StashActionSchema>;

export const StashSchema = z.object({
  items: z.array(ItemSchema).max(1000).default([]),
  coins: z
    .object({ cp: z.number().default(0), sp: z.number().default(0), ep: z.number().default(0), gp: z.number().default(0), pp: z.number().default(0) })
    .prefault({}),
});
export type Stash = z.infer<typeof StashSchema>;

export function parseStash(raw: unknown): Stash {
  const parsed = StashSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : StashSchema.parse({});
}
