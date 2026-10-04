import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { partyOfOne } from "./helpers";

// Stage 5: maps with fog. Players never receive what the fog covers: not the
// pins, not the tokens, not the pixels of the picture.

test("fog of war hides the map from players until the GM reveals it", async ({ browser }) => {
  const { gm, player, campaignId, characterId } = await partyOfOne(browser, "Эльза");
  const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 220, g: 30, b: 30 } } })
    .png()
    .toBuffer();
  const upload = await gm.request.post(`/api/campaigns/${campaignId}/files?name=crypt.png`, { headers: { "content-type": "image/png" }, data: png });
  expect(upload.ok()).toBeTruthy();
  const { id: imageId } = (await upload.json()) as { id: string };
  const created = await gm.request.post(`/api/campaigns/${campaignId}/maps`, {
    data: { name: "Склеп", kind: "combat", imageId, fog: { enabled: true }, grid: { size: 50 } },
  });
  expect(created.ok()).toBeTruthy();
  const { id: mapId } = (await created.json()) as { id: string };
  const url = `/api/campaigns/${campaignId}/maps/${mapId}`;

  // Not revealed yet: players get nothing, not even the picture.
  type Maps = { maps: { id: string; width: number; pins: { label: string }[]; tokens: { id: string; name: string; characterId: string | null }[] }[] };
  expect(((await (await player.request.get(`/api/campaigns/${campaignId}/maps`)).json()) as Maps).maps).toHaveLength(0);
  expect((await player.request.get(`${url}/image`)).status()).toBe(404);
  expect((await player.request.get(`/api/campaigns/${campaignId}/files/${imageId}`)).status()).toBe(404);

  // The GM reveals the left half through the UI.
  await gm.goto(`/campaigns/${campaignId}`);
  await gm.getByRole("radio", { name: "Карты" }).click();
  await expect(gm.getByText("скрыта от игроков")).toBeVisible();
  await gm.getByRole("button", { name: "Партия" }).click();
  await gm.getByRole("radio", { name: /Открыть туман/ }).click();
  const svg = gm.getByRole("img", { name: "Склеп" });
  const box = (await svg.boundingBox())!;
  // The picture is fitted into the box; map its left half to screen pixels.
  const k = Math.min(box.width / 400, box.height / 300);
  const left = box.x + (box.width - 400 * k) / 2;
  const top = box.y + (box.height - 300 * k) / 2;
  await gm.mouse.move(left + 2 * k, top + 2 * k);
  await gm.mouse.down();
  await gm.mouse.move(left + 100 * k, top + 150 * k, { steps: 4 });
  await gm.mouse.move(left + 195 * k, top + 295 * k, { steps: 4 });
  await gm.mouse.up();
  await expect
    .poll(
      async () =>
        ((await (await gm.request.get(`/api/campaigns/${campaignId}/maps`)).json()) as { maps: { fog: { ops: unknown[] } }[] }).maps[0].fog.ops.length,
    )
    .toBe(1);

  // Pins: one in the open, one under the fog, one hidden.
  for (const [label, x, hidden] of [
    ["Алтарь", 100, false],
    ["Тайник", 350, false],
    ["Секрет", 120, true],
  ] as const) {
    const res = await gm.request.post(url, { data: { action: "pin", pin: { id: label, x, y: 150, label, hidden } } });
    expect(res.ok()).toBeTruthy();
  }
  await gm.request.post(url, { data: { action: "addTokens", tokens: [{ id: "x", kind: "monster", name: "Упырь", x: 375, y: 125 }] } });
  await gm.getByRole("button", { name: "Показать всем" }).click();
  await expect(gm.getByRole("button", { name: "Убрать с экрана" })).toBeVisible();

  // The player follows the shown map.
  await player.goto(`/campaigns/${campaignId}`);
  await player.getByRole("radio", { name: "Карты" }).click();
  await expect(player.getByRole("img", { name: "Склеп" })).toBeVisible();
  const seen = ((await (await player.request.get(`/api/campaigns/${campaignId}/maps`)).json()) as Maps).maps[0];
  expect(seen.width).toBe(400);
  expect(seen.pins.map((p) => p.label)).toEqual(["Алтарь"]);
  expect(seen.tokens.map((t) => t.name)).toEqual(["Эльза"]);

  // The picture comes with the fog burnt in.
  const img = await player.request.get(`${url}/image`);
  expect(img.headers()["content-type"]).toBe("image/webp");
  const { data, info } = await sharp(await img.body())
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => data[(y * info.width + x) * info.channels];
  expect(px(50, 150)).toBeGreaterThan(150);
  expect(px(350, 150)).toBeLessThan(40);

  // Players move only their own tokens.
  const own = seen.tokens.find((t) => t.characterId === characterId)!;
  expect((await player.request.post(url, { data: { action: "move", tokenId: own.id, x: 130, y: 130 } })).ok()).toBeTruthy();
  const all = ((await (await gm.request.get(`/api/campaigns/${campaignId}/maps`)).json()) as Maps).maps[0];
  const ghoul = all.tokens.find((t) => t.name === "Упырь")!;
  expect((await player.request.post(url, { data: { action: "move", tokenId: ghoul.id, x: 10, y: 10 } })).status()).toBe(403);
  expect((await player.request.post(url, { data: { action: "fogAll", reveal: true } })).status()).toBe(403);

  // The shared screen shows the same map as the players see it.
  const screen = await gm.context().newPage();
  await screen.goto(`/campaigns/${campaignId}/present`);
  await expect(screen.getByRole("img", { name: "Склеп" })).toBeVisible();
  await expect(screen.locator("[data-token]")).toHaveCount(1);
});
