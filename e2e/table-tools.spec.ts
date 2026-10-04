import { expect, test } from "@playwright/test";
import { partyOfOne } from "./helpers";

// Stage 4: the GM runs a fight (players see hidden monsters left out and
// health as words), opens a shop, ends a session with XP; quests show up.

test("players follow the fight without seeing hidden monsters or their numbers", async ({ browser }) => {
  const { gm, player, campaignId } = await partyOfOne(browser, "Кай");
  const creature = async (nameRu: string) => {
    const res = await gm.request.post(`/api/campaigns/${campaignId}/creatures`, {
      data: { nameRu, size: "medium", type: "нежить", cr: 1, hp: 20, ac: 13, statblock: { type: "doc", content: [{ type: "paragraph" }] } },
    });
    expect(res.ok()).toBeTruthy();
    return ((await res.json()) as { id: string }).id;
  };
  const ghoul = await creature("Упырь");
  const ambush = await creature("Тень");

  await gm.goto(`/campaigns/${campaignId}`);
  await gm.getByRole("radio", { name: "Бой" }).click();
  await gm.getByRole("button", { name: "Новый бой" }).click();
  await gm.getByRole("button", { name: "Партия", exact: true }).click();
  await expect(gm.getByText("игрок", { exact: true })).toBeVisible();

  const { encounters } = (await (await gm.request.get(`/api/campaigns/${campaignId}/encounters`)).json()) as { encounters: { id: string }[] };
  const url = `/api/campaigns/${campaignId}/encounters/${encounters[0].id}`;
  expect((await gm.request.post(url, { data: { action: "addMonsters", creatureId: ghoul } })).ok()).toBeTruthy();
  expect((await gm.request.post(url, { data: { action: "addMonsters", creatureId: ambush, hidden: true } })).ok()).toBeTruthy();
  await gm.getByRole("button", { name: "Инициатива монстрам" }).click();
  await gm.getByRole("button", { name: "Начать" }).click();
  await expect(gm.getByText("раунд 1", { exact: true })).toBeVisible();

  await player.goto(`/campaigns/${campaignId}`);
  await player.getByRole("radio", { name: "Бой" }).click();
  await expect(player.getByText("Упырь")).toBeVisible();
  await expect(player.getByText("Тень")).toHaveCount(0);
  await expect(player.getByText("невредим").first()).toBeVisible();

  // The GM hits the ghoul through the UI; the player sees a word, not numbers.
  const row = gm.locator("div.border-b").filter({ has: gm.getByRole("button", { name: "Упырь" }) });
  await row.getByRole("button", { name: "Урон" }).click();
  await gm.getByRole("dialog").getByLabel("Количество").fill("12");
  await gm.getByRole("dialog").getByRole("button", { name: "Нанести" }).click();
  await expect(gm.getByText("8/20")).toBeVisible();
  await expect(player.getByText("ранен", { exact: true })).toBeVisible();
  await expect(player.getByText("8/20")).toHaveCount(0);
});

test("a player buys in the shop; the session ends with XP; a quest is revealed", async ({ browser }) => {
  const { gm, player, campaignId, characterId } = await partyOfOne(browser, "Мира");
  const gold = await gm.request.post(`/api/campaigns/${campaignId}/actions`, {
    data: { characterIds: [characterId], action: "coins", coin: "gp", amount: 10, reason: "Аванс" },
  });
  expect(gold.ok()).toBeTruthy();
  const tpl = await gm.request.post(`/api/campaigns/${campaignId}/library`, { data: { kind: "item", body: { name: "Факел" } } });
  expect(tpl.ok()).toBeTruthy();
  const { id: templateId } = (await tpl.json()) as { id: string };
  const shop = await gm.request.post(`/api/campaigns/${campaignId}/shops`, {
    data: { name: "Лавка у ворот", open: true, items: [{ id: "torch", templateId, price: 3, coin: "sp", stock: 5 }] },
  });
  expect(shop.ok()).toBeTruthy();

  const before = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as {
    doc: { coins: Record<string, number>; info: { xp: number } };
  };
  const purse = (c: Record<string, number>) => c.cp + c.sp * 10 + c.ep * 50 + c.gp * 100 + c.pp * 1000;

  await player.goto(`/campaigns/${campaignId}`);
  await player.getByRole("radio", { name: "Добыча" }).click();
  await player.getByRole("radio", { name: "Лавка" }).click();
  await expect(player.getByText("Лавка у ворот")).toBeVisible();
  await player.getByRole("button", { name: "Купить" }).click();
  await player.getByRole("dialog").getByLabel("Количество").fill("2");
  await player.getByRole("dialog").getByRole("button", { name: "Купить" }).click();
  await expect(player.getByText("осталось 3")).toBeVisible();

  const bought = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as {
    doc: { coins: Record<string, number>; items: { name: string }[] };
  };
  expect(bought.doc.items.some((i) => i.name === "Факел")).toBeTruthy();
  expect(purse(bought.doc.coins)).toBe(purse(before.doc.coins) - 60);

  // Session: planned through the API, ended in the UI with XP for those present.
  const session = await gm.request.post(`/api/campaigns/${campaignId}/sessions`, {
    data: { title: "Ворота", attendance: [characterId], plan: "Засада у моста" },
  });
  expect(session.ok()).toBeTruthy();
  await gm.goto(`/campaigns/${campaignId}`);
  await gm.getByRole("radio", { name: "Сессии" }).click();
  await gm.getByRole("button", { name: "Закончить" }).click();
  await gm.getByRole("dialog").getByLabel("Опыт каждому").fill("450");
  await gm.getByRole("dialog").getByLabel("Опыт каждому").press("Tab");
  await gm.getByRole("dialog").getByRole("button", { name: "Закончить" }).click();
  await expect(gm.getByText("Опыт: +450")).toBeVisible();
  const after = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as { doc: { info: { xp: number } } };
  expect(after.doc.info.xp).toBe(before.doc.info.xp + 450);
  // Players never get the GM's plan.
  const theirs = (await (await player.request.get(`/api/campaigns/${campaignId}/sessions`)).json()) as { sessions: { plan: string }[] };
  expect(theirs.sessions[0].plan).toBe("");

  // A quest prepared in secret shows up for the player once revealed.
  const quest = await gm.request.post(`/api/campaigns/${campaignId}/handouts`, { data: { kind: "quest", title: "Пропавший караван", revealed: false } });
  expect(quest.ok()).toBeTruthy();
  const { id: questId } = (await quest.json()) as { id: string };
  await player.goto(`/campaigns/${campaignId}`);
  await player.getByRole("radio", { name: "Квесты и раздатки" }).click();
  await expect(player.getByText("Квестов нет")).toBeVisible();
  const reveal = await gm.request.put(`/api/campaigns/${campaignId}/handouts/${questId}`, {
    data: { kind: "quest", title: "Пропавший караван", revealed: true },
  });
  expect(reveal.ok()).toBeTruthy();
  await expect(player.getByText("Пропавший караван")).toBeVisible();
});
