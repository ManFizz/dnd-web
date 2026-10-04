import { expect, test } from "@playwright/test";
import { partyOfOne } from "./helpers";

// GM library and grants: the GM makes a cursed item, grants it with a lock, the
// player's open sheet gets it live and cannot remove it; quick actions and the
// party stash change the sheet with a journal entry.

test("GM grants a locked cursed item and XP; the player's sheet follows", async ({ browser }) => {
  const { gm, player, campaignId, characterId } = await partyOfOne(browser, "Лира");

  // Player keeps the sheet open the whole time.
  await player.goto(`/characters/${characterId}?tab=inventory`);
  await expect(player.getByLabel("Имя персонажа")).toHaveValue("Лира");

  // GM creates a library item through the UI.
  await gm.goto(`/campaigns/${campaignId}`);
  await gm.getByRole("radio", { name: "Справочники" }).click();
  await gm.getByRole("radio", { name: "Библиотека" }).click();
  await gm.getByRole("button", { name: "Создать" }).click();
  await gm.getByRole("menuitem", { name: "Предмет" }).click();
  const dialog = gm.getByRole("dialog");
  await dialog.getByLabel("Название").fill("Кольцо шёпота");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(gm.getByText("Кольцо шёпота")).toBeVisible();

  // Grant it locked and cursed.
  await gm.getByRole("button", { name: "Выдать" }).first().click();
  const grant = gm.getByRole("dialog");
  await grant.getByLabel("Лира").check();
  await grant.getByLabel("За что").fill("Нашли в склепе");
  await grant.getByLabel("Замок").selectOption("noremove");
  await grant.getByLabel(/Проклятый/).check();
  await grant.getByRole("button", { name: "Выдать" }).click();
  await expect(gm.getByText("Выдано")).toBeVisible();

  // The player's sheet shows the ring without a reload.
  await expect(player.getByText("Кольцо шёпота")).toBeVisible();
  await expect(player.getByText("от ГМа").or(player.getByText("проклято"))).toBeVisible();

  // The server refuses a save that drops the locked ring.
  const current = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as { version: number; doc: Record<string, unknown> };
  const dropped = await player.request.put(`/api/characters/${characterId}`, {
    data: { baseVersion: current.version, doc: { ...current.doc, items: [] }, events: [] },
  });
  expect(dropped.status()).toBe(403);

  // Quick action: XP with a reason lands in the sheet.
  const hpBefore = (current.doc as { combat: { hpCurrent: number } }).combat.hpCurrent;
  const hit = await gm.request.post(`/api/campaigns/${campaignId}/actions`, {
    data: { characterIds: [characterId], action: "xp", amount: 300, reason: "Победа над умертвием" },
  });
  expect(hit.ok()).toBeTruthy();
  const after = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as { doc: { info: { xp: number }; combat: { hpCurrent: number } } };
  expect(after.doc.info.xp).toBe(300);
  expect(after.doc.combat.hpCurrent).toBe(hpBefore);

  // GM removes the grant; the ring disappears from the open sheet.
  const grants = (await (await gm.request.get(`/api/campaigns/${campaignId}/grants`)).json()) as { grants: { id: string; name: string }[] };
  const ring = grants.grants.find((g) => g.name === "Кольцо шёпота")!;
  expect((await gm.request.patch(`/api/campaigns/${campaignId}/grants/${ring.id}`, { data: { remove: true, reason: "Сняли проклятие" } })).ok()).toBeTruthy();
  await expect(player.getByText("Кольцо шёпота")).toHaveCount(0);
});

test("a player accepts an offered mutation and picks the body part", async ({ browser }) => {
  const { gm, player, campaignId, characterId } = await partyOfOne(browser, "Торн");
  const tpl = await gm.request.post(`/api/campaigns/${campaignId}/library`, {
    data: { kind: "feature", body: { kind: "mutation", name: "Ноги сатира", source: "Мутация" } },
  });
  expect(tpl.ok()).toBeTruthy();
  const { id: templateId } = (await tpl.json()) as { id: string };
  const offer = await gm.request.post(`/api/campaigns/${campaignId}/grants`, {
    data: { characterIds: [characterId], templateId, bodyPart: "choice", reason: "Смерть, 2 дня" },
  });
  expect(offer.ok()).toBeTruthy();

  await player.goto(`/campaigns/${campaignId}`);
  const panel = player.locator("section", { hasText: "Предложения ГМа" });
  await expect(panel).toContainText("Ноги сатира");
  await panel.getByRole("combobox").selectOption("legs");
  await panel.getByRole("button", { name: "Принять" }).click();
  await expect(panel).toHaveCount(0);

  const doc = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as { doc: { features: { name: string; bodyPart: string }[] } };
  expect(doc.doc.features).toContainEqual(expect.objectContaining({ name: "Ноги сатира", bodyPart: "legs" }));
});
