import "server-only";
import type { z } from "zod";
import { isGmRole } from "@/lib/campaigns";
import { COIN_LABELS, COINS } from "@/lib/rules/constants";
import { BuySchema, formatPrice, payCoins, priceInCp, ShopInputSchema, ShopItemSchema, type ShopItem, type ShopRow } from "@/lib/shop";
import type { Prisma } from "@/generated/prisma/client";
import { requireGm, requireMember } from "./campaigns";
import { prisma } from "./db";
import { createGrants } from "./grants";
import { HttpError } from "./http";
import { publish } from "./realtime";
import { changeSheet, journal } from "./sheets";

// Merchants: the GM sets up a shop from library items; players buy with the
// coins of their sheet, the item arrives as a grant.

function items(raw: unknown): ShopItem[] {
  const parsed = ShopItemSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}

const shopRow = (s: Prisma.ShopGetPayload<object>): ShopRow => ({ id: s.id, name: s.name, description: s.description, open: s.open, items: items(s.items) });

export async function listShops(campaignId: string, userId: string): Promise<ShopRow[]> {
  const me = await requireMember(campaignId, userId);
  const gm = isGmRole(me.role);
  const rows = await prisma.shop.findMany({ where: { campaignId, ...(gm ? {} : { open: true }) }, orderBy: { name: "asc" } });
  return rows.map(shopRow);
}

type ShopInput = z.infer<typeof ShopInputSchema>;

/** Item names come from the library so players see what they buy. */
async function withNames(campaignId: string, input: ShopInput) {
  const templates = new Map(
    (
      await prisma.campaignTemplate.findMany({
        where: { campaignId, kind: "item", id: { in: input.items.map((i) => i.templateId) } },
        select: { id: true, name: true },
      })
    ).map((t) => [t.id, t.name]),
  );
  return input.items.filter((i) => templates.has(i.templateId)).map((i) => ({ ...i, name: templates.get(i.templateId)! }));
}

export async function createShop(campaignId: string, userId: string, input: ShopInput) {
  await requireGm(campaignId, userId);
  const row = await prisma.shop.create({
    data: {
      campaignId,
      name: input.name,
      description: input.description,
      open: input.open,
      items: (await withNames(campaignId, input)) as unknown as Prisma.InputJsonValue,
    },
  });
  await publish({ type: "scope", campaignId, scope: "shop" });
  return { id: row.id };
}

export async function updateShop(campaignId: string, shopId: string, userId: string, input: ShopInput) {
  await requireGm(campaignId, userId);
  const prev = await prisma.shop.findFirst({ where: { id: shopId, campaignId } });
  if (!prev) throw new HttpError(404, "Лавка не найдена");
  await prisma.shop.update({
    where: { id: shopId },
    data: {
      name: input.name,
      description: input.description,
      open: input.open,
      items: (await withNames(campaignId, input)) as unknown as Prisma.InputJsonValue,
    },
  });
  if (input.open && !prev.open) await publish({ type: "notice", campaignId, text: `Открылась лавка «${input.name}»`, gmOnly: false });
  await publish({ type: "scope", campaignId, scope: "shop" });
}

export async function deleteShop(campaignId: string, shopId: string, userId: string) {
  await requireGm(campaignId, userId);
  await prisma.shop.deleteMany({ where: { id: shopId, campaignId } });
  await publish({ type: "scope", campaignId, scope: "shop" });
}

export async function buy(campaignId: string, shopId: string, userId: string, input: z.infer<typeof BuySchema>) {
  const me = await requireMember(campaignId, userId);
  const gm = isGmRole(me.role);
  const link = await prisma.campaignCharacter.findFirst({
    where: { campaignId, characterId: input.characterId, status: "accepted" },
    include: { character: true },
  });
  if (!link || (!gm && link.userId !== userId)) throw new HttpError(403, "Это не ваш персонаж");

  // Reserve the stock first; give it back if the payment fails.
  const reserved = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Shop" WHERE id = ${shopId} FOR UPDATE`;
    const shop = await tx.shop.findFirst({ where: { id: shopId, campaignId } });
    if (!shop || (!shop.open && !gm)) throw new HttpError(404, "Лавка закрыта");
    const list = items(shop.items);
    const item = list.find((i) => i.id === input.itemId);
    if (!item) throw new HttpError(404, "Такого товара нет");
    if (item.stock !== null) {
      if (item.stock < input.quantity) throw new HttpError(409, item.stock ? `Осталось только ${item.stock}` : "Товар закончился");
      item.stock -= input.quantity;
      await tx.shop.update({ where: { id: shop.id }, data: { items: list as unknown as Prisma.InputJsonValue } });
    }
    return { shop, item };
  });
  const { shop, item } = reserved;
  const cost = priceInCp(item.price, item.coin) * input.quantity;
  const priceText = formatPrice(item.price * input.quantity, item.coin);
  const restock = async () => {
    if (item.stock === null) return;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shop" WHERE id = ${shopId} FOR UPDATE`;
      const fresh = await tx.shop.findUnique({ where: { id: shopId } });
      if (!fresh) return;
      const list = items(fresh.items);
      const it = list.find((i) => i.id === item.id);
      if (it && it.stock !== null) it.stock += input.quantity;
      await tx.shop.update({ where: { id: shopId }, data: { items: list as unknown as Prisma.InputJsonValue } });
    });
  };

  try {
    await changeSheet(input.characterId, userId, (doc) => {
      const next = payCoins(doc.coins, cost);
      if (!next) throw new HttpError(400, `Не хватает денег: нужно ${priceText}`);
      const before = COINS.filter((c) => doc.coins[c])
        .map((c) => `${doc.coins[c]} ${COIN_LABELS[c].short}`)
        .join(", ");
      doc.coins = next;
      const after = COINS.filter((c) => next[c])
        .map((c) => `${next[c]} ${COIN_LABELS[c].short}`)
        .join(", ");
      return [journal("coins", `Покупка в «${shop.name}»: ${item.name} ×${input.quantity} за ${priceText} (было ${before || "0"}, стало ${after || "0"})`)];
    });
  } catch (e) {
    await restock();
    throw e;
  }
  try {
    await createGrants(
      campaignId,
      userId,
      {
        characterIds: [input.characterId],
        templateId: item.templateId,
        delivery: "now",
        lock: "none",
        visibility: "visible",
        expires: "never",
        left: 0,
        removal: "",
        reason: `Куплено в «${shop.name}» за ${priceText}`,
        cursed: false,
        triggers: "",
        quantity: input.quantity,
      },
      { trusted: true },
    );
  } catch (e) {
    // The item is gone from the library: give the money back.
    await changeSheet(input.characterId, userId, (doc) => {
      doc.coins.cp += cost;
      return [journal("coins", `Возврат за «${item.name}»: товар больше не продаётся (${cost} мм)`)];
    });
    await restock();
    throw e;
  }
  await publish({ type: "scope", campaignId, scope: "shop" });
  if (!gm) await publish({ type: "notice", campaignId, text: `${link.character.name} купил ${item.name} ×${input.quantity} в «${shop.name}»`, gmOnly: true });
}
