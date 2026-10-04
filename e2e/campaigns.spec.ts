import { expect, test, type Browser, type Page } from "@playwright/test";

// Campaign lobby with two people: the GM invites a player, the player brings a
// character, the GM approves it and then watches the sheet update live.

const stamp = Date.now();
const password = "correct-horse-battery";

async function register(browser: Browser, name: string, slug: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/register");
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Почта").fill(`e2e-${slug}-${stamp}@example.com`);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(/\/characters$/);
  return page;
}

test("GM invites a player, approves the character and sees the sheet live", async ({ browser }) => {
  const gm = await register(browser, "Мастер", "gm");
  const player = await register(browser, "Игрок", "player");

  // The player has a character ready.
  const created = await player.request.post("/api/characters", { data: { doc: { name: "Брам" } } });
  expect(created.ok()).toBeTruthy();
  const { id: characterId } = (await created.json()) as { id: string };

  // GM creates the campaign and an invite link.
  await gm.getByRole("link", { name: "Кампании" }).click();
  await gm.getByRole("button", { name: "Новая кампания" }).click();
  await gm.getByRole("dialog").getByLabel("Название").fill("Проклятие Страда");
  await gm.getByRole("dialog").getByRole("button", { name: "Создать" }).click();
  await expect(gm).toHaveURL(/\/campaigns\/[\w-]+$/);
  await expect(gm.getByText("онлайн")).toBeVisible();
  await gm.getByRole("radio", { name: "Кампания" }).click();
  await gm.getByRole("radio", { name: "Участники" }).click();
  await gm.getByRole("button", { name: "Создать и скопировать ссылку" }).click();
  const link = (await gm.locator("code").filter({ hasText: "/join/" }).first().textContent())?.trim() ?? "";
  expect(link).toMatch(/\/join\/[\w-]+$/);
  await gm.getByRole("radio", { name: "Стол" }).click();

  // Player joins and brings the character.
  await player.goto(new URL(link).pathname);
  await expect(player.getByText("Проклятие Страда")).toBeVisible();
  await player.getByRole("button", { name: /Вступить/ }).click();
  await expect(player).toHaveURL(/\/campaigns\/[\w-]+$/);
  await player.getByRole("button", { name: "Привести персонажа" }).click();
  await player.getByRole("dialog").getByRole("button", { name: /Брам/ }).click();
  await expect(player.getByText("Ждёт проверки ГМа")).toBeVisible();

  // The GM's page shows the request without a reload, and the GM accepts it.
  const review = gm.locator("section", { hasText: "Проверка персонажей" });
  await expect(review).toContainText("Брам");
  await review.getByRole("button", { name: "Принять" }).click();
  await expect(gm.getByRole("link", { name: "Брам" })).toBeVisible();
  await expect(player.getByText("В партии", { exact: true })).toBeVisible();

  // Party bonus table lists the character.
  await gm.getByRole("radio", { name: "Кампания" }).click();
  await gm.getByRole("radio", { name: "Бонусы" }).click();
  await expect(gm.getByRole("columnheader", { name: "Брам" })).toBeVisible();
  await gm.getByRole("radio", { name: "Стол" }).click();

  // GM opens the sheet: read-only, follows the player's saves.
  await gm.getByRole("link", { name: "Брам" }).click();
  await expect(gm).toHaveURL(new RegExp(`/characters/${characterId}$`));
  await expect(gm.getByText("Просмотр ГМа")).toBeVisible();
  await expect(gm.getByLabel("Имя персонажа")).toHaveAttribute("readonly", "");

  const current = (await (await player.request.get(`/api/characters/${characterId}`)).json()) as {
    version: number;
    doc: { name: string } & Record<string, unknown>;
  };
  const saved = await player.request.put(`/api/characters/${characterId}`, {
    data: { baseVersion: current.version, doc: { ...current.doc, name: "Брам Отважный" }, events: [] },
  });
  expect(saved.ok()).toBeTruthy();
  await expect(gm.getByLabel("Имя персонажа")).toHaveValue("Брам Отважный");

  // The GM still cannot save over the player's sheet.
  const denied = await gm.request.put(`/api/characters/${characterId}`, {
    data: { baseVersion: current.version + 1, doc: { ...current.doc, name: "Взлом" }, events: [] },
  });
  expect(denied.ok()).toBeFalsy();
});
