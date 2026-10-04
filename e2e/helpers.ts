import { expect, type Browser, type Page } from "@playwright/test";

export const password = "correct-horse-battery";

export async function register(browser: Browser, name: string, slug: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/register");
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Почта").fill(`e2e-${slug}-${Date.now()}@example.com`);
  await page.getByLabel("Пароль").fill(password);
  // Sign-up is rate limited; tests that register several people wait it out.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    const limited = page.getByText("Слишком много попыток");
    await expect(
      page
        .getByText("Слишком много попыток")
        .or(page.getByRole("heading", { name: "Персонажи" }))
        .first(),
    ).toBeVisible();
    if (!(await limited.isVisible())) break;
    await page.waitForTimeout(11_000);
  }
  await expect(page).toHaveURL(/\/characters$/);
  return page;
}

/** A campaign with one player whose character is accepted, set up through the API. */
export async function partyOfOne(browser: Browser, characterName: string) {
  const gm = await register(browser, "Мастер", "gm");
  const player = await register(browser, "Игрок", "player");
  const created = await player.request.post("/api/characters", { data: { doc: { name: characterName } } });
  expect(created.ok()).toBeTruthy();
  const { id: characterId } = (await created.json()) as { id: string };

  const campaign = await gm.request.post("/api/campaigns", { data: { name: "Испытание" } });
  expect(campaign.ok()).toBeTruthy();
  const { id: campaignId } = (await campaign.json()) as { id: string };
  const invite = await gm.request.post(`/api/campaigns/${campaignId}/invites`, { data: {} });
  const { code } = (await invite.json()) as { code: string };
  expect((await player.request.post(`/api/invites/${code}`)).ok()).toBeTruthy();
  expect((await player.request.post(`/api/campaigns/${campaignId}/characters`, { data: { characterId } })).ok()).toBeTruthy();

  const detail = (await (await gm.request.get(`/api/campaigns/${campaignId}`)).json()) as { characters: { id: string; status: string }[] };
  const link = detail.characters[0];
  if (link.status !== "accepted") {
    expect((await gm.request.patch(`/api/campaigns/${campaignId}/characters/${link.id}`, { data: { action: "accept" } })).ok()).toBeTruthy();
  }
  return { gm, player, campaignId, characterId };
}
