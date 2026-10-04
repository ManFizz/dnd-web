import { z } from "zod";

// Campaigns (rooms): shared types and rules used by both the server and the UI.

export const CAMPAIGN_ROLES = ["gm", "cogm", "player", "spectator"] as const;
export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];

export const ROLE_LABELS: Record<CampaignRole, string> = {
  gm: "ГМ",
  cogm: "Со-ГМ",
  player: "Игрок",
  spectator: "Зритель",
};

export const ROLE_HINTS: Record<CampaignRole, string> = {
  gm: "Создатель кампании: всё, включая участников и удаление кампании",
  cogm: "Помогает вести игру: видит листы партии, но не управляет участниками",
  player: "Приводит своих персонажей",
  spectator: "Видит только список партии",
};

/** Roles that can be given through an invite or changed by the GM. */
export const ASSIGNABLE_ROLES = ["cogm", "player", "spectator"] as const satisfies readonly CampaignRole[];

export const isGmRole = (role: string | null | undefined): boolean => role === "gm" || role === "cogm";

export const CHARACTER_STATUSES = ["pending", "accepted", "returned"] as const;
export type CampaignCharacterStatus = (typeof CHARACTER_STATUSES)[number];

export const CHARACTER_STATUS_LABELS: Record<CampaignCharacterStatus, string> = {
  pending: "Ждёт проверки ГМа",
  accepted: "В партии",
  returned: "Возвращён на доработку",
};

/** Setting fields without defaults, so a partial patch never resets the others. */
const SETTINGS_FIELDS = {
  /** Level new characters should start at. */
  startLevel: z.number().int().min(1).max(20),
  advancement: z.enum(["xp", "milestone"]),
  /** New characters wait for the GM before they join the party. */
  characterApproval: z.boolean(),
  /** Free-form table rules shown to players in the lobby. */
  rules: z.string().max(5000),
  /** Next game, ISO date-time or empty. */
  nextSession: z.string().max(40),
};

export const CampaignSettingsSchema = z.object({
  startLevel: SETTINGS_FIELDS.startLevel.default(1),
  advancement: SETTINGS_FIELDS.advancement.default("xp"),
  characterApproval: SETTINGS_FIELDS.characterApproval.default(true),
  rules: SETTINGS_FIELDS.rules.default(""),
  nextSession: SETTINGS_FIELDS.nextSession.default(""),
});
export type CampaignSettings = z.infer<typeof CampaignSettingsSchema>;

export function parseSettings(raw: unknown): CampaignSettings {
  const parsed = CampaignSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : CampaignSettingsSchema.parse({});
}

export const CampaignInputSchema = z.object({
  name: z.string().trim().min(1, "Нужно название").max(120),
  description: z.string().max(5000).default(""),
  settings: CampaignSettingsSchema.prefault({}),
});

export const CampaignPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(5000).optional(),
  settings: z.object(SETTINGS_FIELDS).partial().optional(),
});

export const InviteInputSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES).default("player"),
  requireApproval: z.boolean().default(false),
  maxUses: z.number().int().min(1).max(1000).nullable().default(null),
  /** Lifetime in hours, null = no expiry. */
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .nullable()
    .default(168),
});

export type CampaignListItem = {
  id: string;
  name: string;
  description: string;
  role: CampaignRole;
  status: "active" | "pending";
  ownerName: string;
  memberCount: number;
  characterCount: number;
  nextSession: string;
  updatedAt: string;
};

export type CampaignMemberRow = {
  id: string;
  userId: string;
  name: string;
  image: string | null;
  role: CampaignRole;
  status: "active" | "pending";
  joinedAt: string;
};

export type CampaignCharacterRow = {
  id: string;
  characterId: string;
  userId: string;
  ownerName: string;
  name: string;
  summary: string;
  avatarUrl: string;
  status: CampaignCharacterStatus;
  note: string;
  mine: boolean;
};

export type CampaignInviteRow = {
  id: string;
  code: string;
  role: CampaignRole;
  requireApproval: boolean;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
};

export type CampaignDetail = {
  id: string;
  name: string;
  description: string;
  settings: CampaignSettings;
  ownerId: string;
  me: { userId: string; role: CampaignRole; status: "active" | "pending" };
  members: CampaignMemberRow[];
  characters: CampaignCharacterRow[];
  /** Only for the GM and co-GMs. */
  invites: CampaignInviteRow[];
};

/** Party member as the GM sees it: the full document, computed on the client. */
export type PartyCharacter = {
  characterId: string;
  ownerName: string;
  status: CampaignCharacterStatus;
  version: number;
  updatedAt: string;
  doc: unknown;
};

/** Messages sent over the campaign event stream. Payloads carry ids only. */
export type CampaignEvent =
  | { type: "character"; campaignId: string; characterId: string; version: number }
  | { type: "members"; campaignId: string }
  | { type: "characters"; campaignId: string }
  | { type: "campaign"; campaignId: string }
  | { type: "deleted"; campaignId: string };

/** What a person sees when they open an invite link. */
export type InvitePreview = {
  code: string;
  campaignId: string;
  campaignName: string;
  description: string;
  ownerName: string;
  role: CampaignRole;
  requireApproval: boolean;
  memberCount: number;
  problem: string | null;
  /** The viewer's current membership, if any. */
  membership: { role: CampaignRole; status: "active" | "pending" } | null;
};

export function invitePath(code: string): string {
  return `/join/${code}`;
}

/** Why an invite cannot be used right now, or null if it can. */
export function inviteProblem(inv: { revokedAt: Date | null; expiresAt: Date | null; maxUses: number | null; uses: number }, now = new Date()): string | null {
  if (inv.revokedAt) return "Приглашение отозвано";
  if (inv.expiresAt && inv.expiresAt.getTime() <= now.getTime()) return "Срок приглашения истёк";
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return "Приглашение уже использовано";
  return null;
}
