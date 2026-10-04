import { expect, test } from "@playwright/test";
import { partyOfOne } from "./helpers";

// Stage 3: custom creatures feed the mutation generator; loot tables roll and
// the coins are split into the sheet.

test("GM rolls a mutation after death and applies it to the sheet", async ({ browser }) => {
  const { gm, player, campaignId, characterId } = await partyOfOne(browser, "Вейла");
  // One giant per challenge rating: whatever the d20 says, a creature fits.
  for (let cr = 1; cr <= 20; cr++) {
    const res = await gm.request.post(`/api/campaigns/${campaignId}/creatures`, {
      data: { nameRu: `Великан ${cr}`, size: "large", type: "великан", cr, statblock: { type: "doc", content: [{ type: "paragraph" }] } },
    });
    expect(res.ok()).toBeTruthy();
  }

  await gm.goto(`/campaigns/${campaignId}`);
  await gm.getByRole("radio", { name: "Справочники" }).click();
  await gm.getByRole("radio", { name: "Мутации" }).click();
  await gm.getByLabel("Кто").selectOption({ label: "Вейла" });
  await gm.getByLabel("Сколько был мёртв").fill("2");
  await gm.getByLabel("Сколько был мёртв").press("Tab");
  await gm.getByRole("button", { name: /Бросить \(5\)/ }).click();
  await expect(gm.getByText("Вейла: 2 дня")).toBeVisible();
  await expect(gm.getByText(/Великан \d+/).first()).toBeVisible();

  await gm.getByRole("button", { name: "Применить" }).click();
  await gm.getByRole("dialog").getByRole("button", { name: "Применить" }).click();
  await expect(gm.getByText("Мутации в листе")).toBeVisible();

  const grants = (await (await gm.request.get(`/api/campaigns/${campaignId}/grants`)).json()) as { grants: { status: string; reason: string }[] };
  const fromDeath = grants.grants.filter((g) => g.reason === "Смерть, 2 дня");
  expect(fromDeath.length).toBe(5);
  const doc = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as {
    doc: { features: { kind: string; grant: { lock: string } | null }[] };
  };
  const mutations = doc.doc.features.filter((f) => f.kind === "mutation");
  // Same part twice replaces, part 6 waits for the player's choice: at least one lands, at most five.
  expect(mutations.length).toBeGreaterThan(0);
  expect(mutations.every((m) => m.grant?.lock === "noremove")).toBeTruthy();
});

test("loot from a starter table is split between characters", async ({ browser }) => {
  const { gm, player, campaignId, characterId } = await partyOfOne(browser, "Дорн");
  expect((await gm.request.post(`/api/campaigns/${campaignId}/loot/tables`, { data: { starter: true } })).ok()).toBeTruthy();

  await gm.goto(`/campaigns/${campaignId}`);
  await gm.getByRole("radio", { name: "Добыча" }).click();
  await gm.getByRole("radio", { name: "Лут" }).click();
  await expect(gm.getByText("Карманы: опасность 0–4")).toBeVisible();
  await gm.getByRole("button", { name: "Бросить" }).first().click();
  await expect(gm.getByText("Как выпало")).toBeVisible();

  const before = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as { doc: { coins: Record<string, number> } };
  await gm.getByRole("button", { name: "Раздать" }).click();
  await expect(gm.getByText("Добыча роздана")).toBeVisible();
  const after = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as { doc: { coins: Record<string, number> } };
  const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
  expect(sum(after.doc.coins)).toBeGreaterThan(sum(before.doc.coins));
});
