import { z } from "zod";
import { RichDocSchema } from "./rules/schema";
import { emptyDoc, type RichDoc } from "./rules/richtext";

// Game sessions (always offline: the table meets in person) and the GM's
// handouts and quests.

export const SessionInputSchema = z.object({
  title: z.string().max(200).default(""),
  plannedAt: z.string().max(40).nullable().default(null),
  plan: z.string().max(20000).default(""),
  report: z.string().max(20000).default(""),
  attendance: z.array(z.string().max(80)).max(50).default([]),
});

export const SessionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), data: SessionInputSchema }),
  z.object({ action: z.literal("start") }),
  /** Ends the session: "until the end of the session" grants expire; optional XP for those who came. */
  z.object({ action: z.literal("end"), xp: z.number().int().min(0).max(1_000_000).default(0), reason: z.string().max(300).default("") }),
  z.object({ action: z.literal("delete") }),
]);

export type SessionRow = {
  id: string;
  number: number;
  title: string;
  plannedAt: string | null;
  status: "planned" | "active" | "done";
  attendance: string[];
  /** Only for the GM. */
  plan: string;
  report: string;
  rewards: { xp: number; reason: string } | null;
  startedAt: string | null;
  endedAt: string | null;
};

export const SESSION_STATUS_LABELS: Record<SessionRow["status"], string> = {
  planned: "Запланирована",
  active: "Идёт",
  done: "Прошла",
};

export const HANDOUT_KINDS = ["handout", "quest"] as const;
export const QUEST_STATUSES = ["open", "done", "failed"] as const;
export const QUEST_STATUS_LABELS: Record<(typeof QUEST_STATUSES)[number], string> = {
  open: "В работе",
  done: "Выполнен",
  failed: "Провален",
};

export const HandoutInputSchema = z.object({
  kind: z.enum(HANDOUT_KINDS).default("handout"),
  title: z.string().trim().min(1, "Нужно название").max(300),
  body: RichDocSchema.default(emptyDoc),
  imageId: z.string().max(80).nullable().default(null),
  visibleTo: z.array(z.string().max(80)).max(50).default([]),
  revealed: z.boolean().default(false),
  status: z.enum(QUEST_STATUSES).default("open"),
  order: z.number().int().default(0),
});
export type HandoutInput = z.infer<typeof HandoutInputSchema>;

export type HandoutRow = {
  id: string;
  kind: (typeof HANDOUT_KINDS)[number];
  title: string;
  body: RichDoc;
  imageId: string | null;
  visibleTo: string[];
  revealed: boolean;
  status: (typeof QUEST_STATUSES)[number];
  order: number;
  updatedAt: string;
};

/** Battle maps are big pictures; nginx must allow this body size too. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
