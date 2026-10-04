import "server-only";
import { nanoid } from "nanoid";
import type { z } from "zod";
import {
  CampaignSettingsSchema,
  inviteProblem,
  isGmRole,
  parseSettings,
  type CampaignCharacterRow,
  type CampaignCharacterStatus,
  type CampaignDetail,
  type CampaignInputSchema,
  type CampaignInviteRow,
  type CampaignListItem,
  type CampaignMemberRow,
  type CampaignPatchSchema,
  type CampaignRole,
  type InviteInputSchema,
  type InvitePreview,
  type PartyCharacter,
} from "@/lib/campaigns";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { releaseGrants } from "./grants";
import { HttpError } from "./http";
import { publish } from "./realtime";

type Member = { id: string; role: CampaignRole; status: "active" | "pending" };

const asRole = (r: string) => r as CampaignRole;
const asMemberStatus = (s: string) => (s === "pending" ? "pending" : "active") as "active" | "pending";
const asCharStatus = (s: string) => s as CampaignCharacterStatus;

/** Avatars may be data URLs; keep big ones out of list payloads. */
const listAvatar = (url: string) => (url.length > 2000 ? "" : url);

export async function membership(campaignId: string, userId: string): Promise<Member | null> {
  const m = await prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  return m ? { id: m.id, role: asRole(m.role), status: asMemberStatus(m.status) } : null;
}

/** Active member of the campaign, or 404 (the campaign is not revealed to outsiders). */
export async function requireMember(campaignId: string, userId: string, opts: { allowPending?: boolean } = {}): Promise<Member> {
  const m = await membership(campaignId, userId);
  if (!m || (m.status !== "active" && !opts.allowPending)) throw new HttpError(404, "Кампания не найдена");
  return m;
}

export async function requireGm(campaignId: string, userId: string): Promise<Member> {
  const m = await requireMember(campaignId, userId);
  if (!isGmRole(m.role)) throw new HttpError(403, "Это может только ГМ");
  return m;
}

/** Only the owner (role gm) manages members, invites and the campaign itself. */
export async function requireOwner(campaignId: string, userId: string): Promise<Member> {
  const m = await requireMember(campaignId, userId);
  if (m.role !== "gm") throw new HttpError(403, "Это может только создатель кампании");
  return m;
}

export async function listCampaigns(userId: string): Promise<CampaignListItem[]> {
  const rows = await prisma.campaignMember.findMany({
    where: { userId },
    include: {
      campaign: {
        include: {
          owner: { select: { name: true } },
          _count: { select: { members: { where: { status: "active" } }, characters: { where: { status: "accepted" } } } },
        },
      },
    },
    orderBy: { campaign: { updatedAt: "desc" } },
  });
  return rows.map((m) => ({
    id: m.campaign.id,
    name: m.campaign.name,
    description: m.campaign.description,
    role: asRole(m.role),
    status: asMemberStatus(m.status),
    ownerName: m.campaign.owner.name,
    memberCount: m.campaign._count.members,
    characterCount: m.campaign._count.characters,
    nextSession: parseSettings(m.campaign.settings).nextSession,
    updatedAt: m.campaign.updatedAt.toISOString(),
  }));
}

export async function createCampaign(userId: string, input: z.infer<typeof CampaignInputSchema>) {
  const row = await prisma.campaign.create({
    data: {
      name: input.name,
      description: input.description,
      ownerId: userId,
      settings: input.settings as unknown as Prisma.InputJsonValue,
      members: { create: { userId, role: "gm", status: "active" } },
    },
  });
  return { id: row.id };
}

export async function getCampaign(campaignId: string, userId: string): Promise<CampaignDetail> {
  const me = await requireMember(campaignId, userId, { allowPending: true });
  const gm = isGmRole(me.role) && me.status === "active";
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      members: { include: { user: { select: { name: true, image: true } } }, orderBy: { joinedAt: "asc" } },
      characters: {
        include: {
          character: { select: { name: true, summary: true, avatarUrl: true } },
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      invites: gm ? { where: { revokedAt: null }, orderBy: { createdAt: "desc" } } : false,
    },
  });
  if (!campaign) throw new HttpError(404, "Кампания не найдена");
  const pendingSelf = me.status === "pending";
  const members: CampaignMemberRow[] = pendingSelf
    ? []
    : campaign.members
        .filter((m) => gm || m.status === "active")
        .map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.user.name,
          image: m.user.image ?? null,
          role: asRole(m.role),
          status: asMemberStatus(m.status),
          joinedAt: m.joinedAt.toISOString(),
        }));
  // Players see the party (accepted characters) and their own; the GM sees everything.
  const characters: CampaignCharacterRow[] = pendingSelf
    ? []
    : campaign.characters
        .filter((c) => gm || c.userId === userId || c.status === "accepted")
        .map((c) => ({
          id: c.id,
          characterId: c.characterId,
          userId: c.userId,
          ownerName: c.user.name,
          name: c.character.name,
          summary: c.character.summary,
          avatarUrl: listAvatar(c.character.avatarUrl),
          status: asCharStatus(c.status),
          note: gm || c.userId === userId ? c.note : "",
          mine: c.userId === userId,
        }));
  const invites: CampaignInviteRow[] = (campaign.invites ?? [])
    .filter((i) => !inviteProblem(i))
    .map((i) => ({
      id: i.id,
      code: i.code,
      role: asRole(i.role),
      requireApproval: i.requireApproval,
      maxUses: i.maxUses,
      uses: i.uses,
      expiresAt: i.expiresAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    }));
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    settings: parseSettings(campaign.settings),
    ownerId: campaign.ownerId,
    me: { userId, role: me.role, status: me.status },
    members,
    characters,
    invites: me.role === "gm" ? invites : [],
  };
}

export async function updateCampaign(campaignId: string, userId: string, patch: z.infer<typeof CampaignPatchSchema>) {
  await requireOwner(campaignId, userId);
  const current = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { settings: true } });
  const settings = patch.settings ? CampaignSettingsSchema.parse({ ...parseSettings(current.settings), ...patch.settings }) : undefined;
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(settings ? { settings: settings as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  await publish({ type: "campaign", campaignId });
}

export async function deleteCampaign(campaignId: string, userId: string) {
  await requireOwner(campaignId, userId);
  const party = await prisma.campaignCharacter.findMany({ where: { campaignId }, select: { characterId: true } });
  await releaseGrants(
    campaignId,
    party.map((l) => l.characterId),
  );
  await prisma.campaign.delete({ where: { id: campaignId } });
  await publish({ type: "deleted", campaignId });
}

// ---------------------------------------------------------------- invites

export async function createInvite(campaignId: string, userId: string, input: z.infer<typeof InviteInputSchema>) {
  await requireOwner(campaignId, userId);
  const active = await prisma.campaignInvite.count({ where: { campaignId, revokedAt: null } });
  if (active >= 50) throw new HttpError(400, "Слишком много активных приглашений: отзовите старые");
  const invite = await prisma.campaignInvite.create({
    data: {
      campaignId,
      code: nanoid(12),
      role: input.role,
      requireApproval: input.requireApproval,
      maxUses: input.maxUses,
      expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3600_000) : null,
      createdById: userId,
    },
  });
  await publish({ type: "members", campaignId });
  return { id: invite.id, code: invite.code };
}

export async function revokeInvite(campaignId: string, inviteId: string, userId: string) {
  await requireOwner(campaignId, userId);
  const res = await prisma.campaignInvite.updateMany({ where: { id: inviteId, campaignId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw new HttpError(404, "Приглашение не найдено");
  await publish({ type: "members", campaignId });
}

export async function previewInvite(code: string, userId: string): Promise<InvitePreview> {
  const inv = await prisma.campaignInvite.findUnique({
    where: { code },
    include: {
      campaign: {
        include: { owner: { select: { name: true } }, _count: { select: { members: { where: { status: "active" } } } } },
      },
    },
  });
  if (!inv) throw new HttpError(404, "Приглашение не найдено");
  const m = await membership(inv.campaignId, userId);
  return {
    code: inv.code,
    campaignId: inv.campaignId,
    campaignName: inv.campaign.name,
    description: inv.campaign.description,
    ownerName: inv.campaign.owner.name,
    role: asRole(inv.role),
    requireApproval: inv.requireApproval,
    memberCount: inv.campaign._count.members,
    problem: inviteProblem(inv),
    membership: m ? { role: m.role, status: m.status } : null,
  };
}

export async function joinByCode(code: string, userId: string): Promise<{ campaignId: string; status: "active" | "pending" }> {
  return prisma
    .$transaction(async (tx) => {
      // Lock the invite row so parallel joins cannot exceed maxUses.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "CampaignInvite" WHERE code = ${code} FOR UPDATE`;
      if (!locked.length) throw new HttpError(404, "Приглашение не найдено");
      const inv = await tx.campaignInvite.findUniqueOrThrow({ where: { code } });
      const existing = await tx.campaignMember.findUnique({ where: { campaignId_userId: { campaignId: inv.campaignId, userId } } });
      if (existing) return { campaignId: inv.campaignId, status: asMemberStatus(existing.status) };
      const problem = inviteProblem(inv);
      if (problem) throw new HttpError(410, problem);
      const status: "active" | "pending" = inv.requireApproval ? "pending" : "active";
      await tx.campaignMember.create({ data: { campaignId: inv.campaignId, userId, role: inv.role, status } });
      await tx.campaignInvite.update({ where: { id: inv.id }, data: { uses: { increment: 1 } } });
      await tx.campaign.update({ where: { id: inv.campaignId }, data: { updatedAt: new Date() } });
      return { campaignId: inv.campaignId, status };
    })
    .then(async (res) => {
      await publish({ type: "members", campaignId: res.campaignId });
      return res;
    });
}

// ---------------------------------------------------------------- members

export async function updateMember(campaignId: string, memberId: string, userId: string, patch: { role?: Exclude<CampaignRole, "gm">; approve?: boolean }) {
  await requireOwner(campaignId, userId);
  const target = await prisma.campaignMember.findFirst({ where: { id: memberId, campaignId } });
  if (!target) throw new HttpError(404, "Участник не найден");
  if (target.role === "gm") throw new HttpError(400, "Роль создателя кампании не меняется");
  await prisma.campaignMember.update({
    where: { id: memberId },
    data: { ...(patch.role ? { role: patch.role } : {}), ...(patch.approve ? { status: "active" } : {}) },
  });
  await publish({ type: "members", campaignId });
}

/** Removes a member (the GM kicking someone, or anyone leaving). Their characters leave too. */
export async function removeMember(campaignId: string, memberId: string, userId: string) {
  const me = await requireMember(campaignId, userId, { allowPending: true });
  const target = await prisma.campaignMember.findFirst({ where: { id: memberId, campaignId } });
  if (!target) throw new HttpError(404, "Участник не найден");
  const self = target.userId === userId;
  if (!self && me.role !== "gm") throw new HttpError(403, "Это может только создатель кампании");
  if (target.role === "gm") throw new HttpError(400, "Создатель не может покинуть кампанию: её можно только удалить");
  const leaving = await prisma.campaignCharacter.findMany({ where: { campaignId, userId: target.userId }, select: { characterId: true } });
  await releaseGrants(
    campaignId,
    leaving.map((l) => l.characterId),
  );
  await prisma.$transaction([
    prisma.campaignCharacter.deleteMany({ where: { campaignId, userId: target.userId } }),
    prisma.campaignMember.delete({ where: { id: memberId } }),
  ]);
  await publish({ type: "members", campaignId });
  await publish({ type: "characters", campaignId });
}

// ---------------------------------------------------------------- characters

export async function attachCharacter(campaignId: string, userId: string, characterId: string) {
  const me = await requireMember(campaignId, userId);
  if (me.role === "spectator") throw new HttpError(403, "Зрители не приводят персонажей");
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { ownerId: true, campaign: true } });
  if (!character || character.ownerId !== userId) throw new HttpError(404, "Персонаж не найден");
  if (character.campaign) {
    throw new HttpError(409, character.campaign.campaignId === campaignId ? "Персонаж уже в этой кампании" : "Персонаж уже состоит в другой кампании");
  }
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { settings: true } });
  // The GM's own characters (NPC companions) need no approval.
  const needsApproval = parseSettings(campaign.settings).characterApproval && !isGmRole(me.role);
  await prisma.campaignCharacter.create({
    data: { campaignId, characterId, userId, status: needsApproval ? "pending" : "accepted" },
  });
  await publish({ type: "characters", campaignId });
}

export async function reviewCharacter(campaignId: string, linkId: string, userId: string, input: { status: "accepted" | "returned"; note: string }) {
  await requireGm(campaignId, userId);
  const res = await prisma.campaignCharacter.updateMany({
    where: { id: linkId, campaignId },
    data: { status: input.status, note: input.status === "returned" ? input.note : "" },
  });
  if (res.count === 0) throw new HttpError(404, "Персонаж не найден");
  await publish({ type: "characters", campaignId });
}

/** Sends a returned character back for review after the player fixed it. */
export async function resubmitCharacter(campaignId: string, linkId: string, userId: string) {
  await requireMember(campaignId, userId);
  const res = await prisma.campaignCharacter.updateMany({ where: { id: linkId, campaignId, userId, status: "returned" }, data: { status: "pending" } });
  if (res.count === 0) throw new HttpError(404, "Персонаж не найден");
  await publish({ type: "characters", campaignId });
}

export async function detachCharacter(campaignId: string, linkId: string, userId: string) {
  const me = await requireMember(campaignId, userId);
  const link = await prisma.campaignCharacter.findFirst({ where: { id: linkId, campaignId } });
  if (!link) throw new HttpError(404, "Персонаж не найден");
  if (link.userId !== userId && me.role !== "gm") throw new HttpError(403, "Убрать чужого персонажа может только создатель кампании");
  await releaseGrants(campaignId, [link.characterId]);
  await prisma.campaignCharacter.delete({ where: { id: linkId } });
  await publish({ type: "characters", campaignId });
}

/** Full documents of the campaign's characters, for the GM dashboard. */
export async function getParty(campaignId: string, userId: string): Promise<PartyCharacter[]> {
  await requireGm(campaignId, userId);
  const rows = await prisma.campaignCharacter.findMany({
    where: { campaignId },
    include: { character: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    characterId: r.characterId,
    ownerName: r.user.name,
    status: asCharStatus(r.status),
    version: r.character.version,
    updatedAt: r.character.updatedAt.toISOString(),
    doc: r.character.data,
  }));
}

/** Characters of the user that are free to bring into a campaign. */
export async function freeCharacters(userId: string) {
  const rows = await prisma.character.findMany({
    where: { ownerId: userId, campaign: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, summary: true, avatarUrl: true },
  });
  return rows.map((r) => ({ ...r, avatarUrl: listAvatar(r.avatarUrl) }));
}

/**
 * Campaign that lets this user read someone else's character: the GM and co-GMs
 * of the campaign the character is in. Returns null when there is none.
 */
export async function gmCampaignFor(characterId: string, userId: string): Promise<string | null> {
  const link = await prisma.campaignCharacter.findUnique({ where: { characterId }, select: { campaignId: true } });
  if (!link) return null;
  const m = await membership(link.campaignId, userId);
  return m && m.status === "active" && isGmRole(m.role) ? link.campaignId : null;
}

/** Tell the campaign (if any) that a character was saved. */
export async function announceCharacterSaved(characterId: string, version: number) {
  try {
    const link = await prisma.campaignCharacter.findUnique({ where: { characterId }, select: { campaignId: true } });
    if (link) await publish({ type: "character", campaignId: link.campaignId, characterId, version });
  } catch (e) {
    // The save itself succeeded; the dashboard catches up on the next event.
    console.error("announce character save failed", e);
  }
}

/** Which campaign the character is in, with its status, for the sheet header. */
export async function characterCampaign(characterId: string) {
  const link = await prisma.campaignCharacter.findUnique({
    where: { characterId },
    include: { campaign: { select: { id: true, name: true } } },
  });
  return link ? { id: link.campaign.id, name: link.campaign.name, status: asCharStatus(link.status), note: link.note } : null;
}
