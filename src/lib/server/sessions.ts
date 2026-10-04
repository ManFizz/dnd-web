import "server-only";
import type { z } from "zod";
import { isGmRole } from "@/lib/campaigns";
import { expireOnSessionEnd } from "@/lib/rules/grant-rules";
import { RichDocSchema } from "@/lib/rules/schema";
import { emptyDoc } from "@/lib/rules/richtext";
import { HandoutInputSchema, IMAGE_TYPES, MAX_IMAGE_BYTES, SessionActionSchema, SessionInputSchema, type HandoutRow, type SessionRow } from "@/lib/sessions";
import type { Prisma } from "@/generated/prisma/client";
import { requireGm, requireMember } from "./campaigns";
import { prisma } from "./db";
import { HttpError } from "./http";
import { publish } from "./realtime";
import { changeSheet, journal } from "./sheets";

// Game sessions, handouts and quests, and the image files they use.

// ---------------------------------------------------------------- sessions

type SessionDb = Prisma.GameSessionGetPayload<object>;

function sessionRow(s: SessionDb, gm: boolean): SessionRow {
  const rewards = s.rewards as { xp?: number; reason?: string } | null;
  return {
    id: s.id,
    number: s.number,
    title: s.title,
    plannedAt: s.plannedAt?.toISOString() ?? null,
    status: s.status as SessionRow["status"],
    attendance: s.attendance,
    plan: gm ? s.plan : "",
    report: s.report,
    rewards: rewards ? { xp: rewards.xp ?? 0, reason: rewards.reason ?? "" } : null,
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
  };
}

export async function listSessions(campaignId: string, userId: string): Promise<SessionRow[]> {
  const me = await requireMember(campaignId, userId);
  const rows = await prisma.gameSession.findMany({ where: { campaignId }, orderBy: { number: "desc" }, take: 200 });
  return rows.map((r) => sessionRow(r, isGmRole(me.role)));
}

function plannedDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createSession(campaignId: string, userId: string, input: z.infer<typeof SessionInputSchema>) {
  await requireGm(campaignId, userId);
  const last = await prisma.gameSession.findFirst({ where: { campaignId }, orderBy: { number: "desc" }, select: { number: true } });
  const row = await prisma.gameSession.create({
    data: {
      campaignId,
      number: (last?.number ?? 0) + 1,
      title: input.title,
      plannedAt: plannedDate(input.plannedAt),
      plan: input.plan,
      report: input.report,
      attendance: input.attendance,
    },
  });
  await publish({ type: "scope", campaignId, scope: "sessions" });
  return { id: row.id };
}

export async function sessionAction(campaignId: string, sessionId: string, userId: string, a: z.infer<typeof SessionActionSchema>) {
  await requireGm(campaignId, userId);
  const s = await prisma.gameSession.findFirst({ where: { id: sessionId, campaignId } });
  if (!s) throw new HttpError(404, "Сессия не найдена");
  const label = `Сессия ${s.number}${s.title ? ` «${s.title}»` : ""}`;
  if (a.action === "delete") {
    await prisma.gameSession.delete({ where: { id: s.id } });
  } else if (a.action === "save") {
    await prisma.gameSession.update({
      where: { id: s.id },
      data: { title: a.data.title, plannedAt: plannedDate(a.data.plannedAt), plan: a.data.plan, report: a.data.report, attendance: a.data.attendance },
    });
  } else if (a.action === "start") {
    if (s.status !== "planned") throw new HttpError(409, "Сессия уже начата");
    let attendance = s.attendance;
    if (!attendance.length) {
      attendance = (await prisma.campaignCharacter.findMany({ where: { campaignId, status: "accepted" }, select: { characterId: true } })).map(
        (c) => c.characterId,
      );
    }
    await prisma.gameSession.update({ where: { id: s.id }, data: { status: "active", startedAt: new Date(), attendance } });
    await publish({ type: "notice", campaignId, text: `${label} началась`, gmOnly: false });
  } else {
    if (s.status === "done") throw new HttpError(409, "Сессия уже закончилась");
    const claimed = await prisma.gameSession.updateMany({
      where: { id: s.id, status: { not: "done" } },
      data: { status: "done", endedAt: new Date(), rewards: { xp: a.xp, reason: a.reason } },
    });
    if (!claimed.count) throw new HttpError(409, "Сессия уже закончилась");
    const party = new Set(
      (await prisma.campaignCharacter.findMany({ where: { campaignId, status: "accepted" }, select: { characterId: true } })).map((c) => c.characterId),
    );
    // Grants "until the end of the session" end for everyone in the party.
    for (const characterId of party) {
      const came = s.attendance.includes(characterId);
      await changeSheet(characterId, userId, (doc) => {
        const events = [];
        const ended = expireOnSessionEnd(doc);
        if (ended.length) events.push(journal("grant", `${label} закончилась: ${ended.map((n) => `«${n}»`).join(", ")}`));
        if (came && a.xp > 0) {
          const before = doc.info.xp;
          doc.info.xp += a.xp;
          events.push(journal("xp", `${label}: опыт ${before.toLocaleString("ru")} → ${doc.info.xp.toLocaleString("ru")} (+${a.xp})`, a.reason || label));
        }
        return events;
      });
    }
    await publish({ type: "scope", campaignId, scope: "grants" });
  }
  await publish({ type: "scope", campaignId, scope: "sessions" });
}

// ---------------------------------------------------------------- handouts

function handoutRow(h: Prisma.HandoutGetPayload<object>): HandoutRow {
  const body = RichDocSchema.safeParse(h.body);
  return {
    id: h.id,
    kind: h.kind as HandoutRow["kind"],
    title: h.title,
    body: body.success ? body.data : emptyDoc(),
    imageId: h.imageId,
    visibleTo: h.visibleTo,
    revealed: h.revealed,
    status: h.status as HandoutRow["status"],
    order: h.order,
    updatedAt: h.updatedAt.toISOString(),
  };
}

async function ownCharacters(campaignId: string, userId: string): Promise<string[]> {
  return (await prisma.campaignCharacter.findMany({ where: { campaignId, userId, status: "accepted" }, select: { characterId: true } })).map(
    (c) => c.characterId,
  );
}

export async function listHandouts(campaignId: string, userId: string): Promise<HandoutRow[]> {
  const me = await requireMember(campaignId, userId);
  const rows = await prisma.handout.findMany({ where: { campaignId }, orderBy: [{ kind: "asc" }, { order: "asc" }, { createdAt: "desc" }] });
  if (isGmRole(me.role)) return rows.map(handoutRow);
  const own = await ownCharacters(campaignId, userId);
  return rows.filter((h) => h.revealed && (!h.visibleTo.length || h.visibleTo.some((id) => own.includes(id)))).map(handoutRow);
}

type HandoutInput = z.infer<typeof HandoutInputSchema>;

const handoutData = (h: HandoutInput) => ({
  kind: h.kind,
  title: h.title,
  body: h.body as unknown as Prisma.InputJsonValue,
  imageId: h.imageId,
  visibleTo: h.visibleTo,
  revealed: h.revealed,
  status: h.status,
  order: h.order,
});

/** Tells the players who can now see a handout. */
async function announce(campaignId: string, h: HandoutInput, wasVisible: boolean) {
  if (!h.revealed || wasVisible) return;
  const text = h.kind === "quest" ? `Новый квест: «${h.title}»` : `ГМ показал: «${h.title}»`;
  if (!h.visibleTo.length) {
    await publish({ type: "notice", campaignId, text, gmOnly: false });
    return;
  }
  const owners = await prisma.campaignCharacter.findMany({ where: { campaignId, characterId: { in: h.visibleTo } }, select: { userId: true } });
  for (const userId of new Set(owners.map((o) => o.userId))) await publish({ type: "notice", campaignId, text, gmOnly: false, to: userId });
}

export async function createHandout(campaignId: string, userId: string, input: HandoutInput) {
  await requireGm(campaignId, userId);
  if ((await prisma.handout.count({ where: { campaignId } })) >= 1000) throw new HttpError(400, "Записей уже 1000");
  const row = await prisma.handout.create({ data: { campaignId, ...handoutData(input) } });
  await announce(campaignId, input, false);
  await publish({ type: "scope", campaignId, scope: "handouts" });
  return { id: row.id };
}

export async function updateHandout(campaignId: string, handoutId: string, userId: string, input: HandoutInput) {
  await requireGm(campaignId, userId);
  const prev = await prisma.handout.findFirst({ where: { id: handoutId, campaignId } });
  if (!prev) throw new HttpError(404, "Запись не найдена");
  await prisma.handout.update({ where: { id: prev.id }, data: handoutData(input) });
  await announce(campaignId, input, prev.revealed);
  await publish({ type: "scope", campaignId, scope: "handouts" });
}

export async function deleteHandout(campaignId: string, handoutId: string, userId: string) {
  await requireGm(campaignId, userId);
  await prisma.handout.deleteMany({ where: { id: handoutId, campaignId } });
  await publish({ type: "scope", campaignId, scope: "handouts" });
}

// ---------------------------------------------------------------- files

export async function uploadFile(campaignId: string, userId: string, name: string, mime: string, data: Uint8Array) {
  await requireGm(campaignId, userId);
  if (!IMAGE_TYPES.includes(mime)) throw new HttpError(400, "Можно загрузить PNG, JPEG, WebP или GIF");
  if (data.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, "Картинка больше 8 МБ");
  const used = await prisma.campaignFile.aggregate({ where: { campaignId }, _sum: { size: true } });
  if ((used._sum.size ?? 0) + data.byteLength > 500 * 1024 * 1024) throw new HttpError(400, "Файлы кампании заняли 500 МБ");
  const row = await prisma.campaignFile.create({ data: { campaignId, name: name.slice(0, 200), mime, size: data.byteLength, data: Buffer.from(data) } });
  return { id: row.id };
}

export async function readFile(campaignId: string, fileId: string, userId: string) {
  await requireMember(campaignId, userId);
  const f = await prisma.campaignFile.findFirst({ where: { id: fileId, campaignId } });
  if (!f) throw new HttpError(404, "Файл не найден");
  return f;
}
