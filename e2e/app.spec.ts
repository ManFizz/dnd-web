import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { join } from "node:path";

// One account per run; tests share it in order (register first).
const email = `e2e-${Date.now()}@example.com`;
const password = "correct-horse-battery";

test.describe.configure({ mode: "serial" });

// The session from the first form sign-in is reused: sign-in attempts are rate limited.
let session: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

async function signIn(page: Page, { viaForm = false } = {}) {
  if (session.length && !viaForm) {
    await page.context().addCookies(session);
    await page.goto("/characters");
  } else {
    await page.goto("/login");
    await page.getByLabel("Почта").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/characters$/);
  session = await page.context().cookies();
}

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Разделы листа" }).getByRole("button", { name, exact: true });

async function waitSaved(page: Page) {
  await expect(page.getByText("Сохранено")).toBeVisible({ timeout: 15_000 });
}

test("registration redirects to the empty character list", async ({ page }) => {
  await page.goto("/characters");
  await expect(page).toHaveURL(/\/login\?next=%2Fcharacters/);
  await page.getByRole("link", { name: "Зарегистрироваться" }).click();
  await page.getByLabel("Имя").fill("Тестер");
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.getByText("Здесь пока пусто")).toBeVisible();
});

test("wizard creates a character and the sheet applies item effects", async ({ page }) => {
  await signIn(page, { viaForm: true });
  await page.getByRole("link", { name: "Новый персонаж" }).click();

  await page.getByLabel("Имя персонажа").fill("Мирра");
  await page.getByRole("button", { name: "Далее" }).click();
  // Race: human is preselected.
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: /^Волшебник/ }).click();
  await page.getByRole("checkbox", { name: /Анализ/ }).check();
  await page.getByRole("checkbox", { name: /Медицина/ }).check();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: /^Мудрец/ }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Расставить под класс" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText("СЛ заклинаний")).toBeVisible();
  await page.getByRole("button", { name: "Создать персонажа" }).click();

  await expect(page).toHaveURL(/\/characters\/[\w-]+$/);
  await expect(page.getByLabel("Имя персонажа")).toHaveValue("Мирра");
  // Standard array placed for a wizard: DEX 13 + 1 (human) = 14, AC 12.
  const ac = page.getByRole("group", { name: "КД" });
  await expect(ac).toContainText("12");

  // An equipped item with an effect changes AC on its own.
  await tab(page, "Снаряжение").click();
  await page.getByRole("button", { name: "Предмет", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название").fill("Плащ защиты");
  await dialog.getByLabel("Откуда").fill("Награда гильдии");
  await dialog.getByRole("switch", { name: "Надет / в руках" }).click();
  await dialog.getByRole("radio", { name: /Эффекты/ }).click();
  await dialog.getByRole("button", { name: "Эффект", exact: true }).click();
  await dialog.getByRole("button", { name: /Сила/ }).click();
  await page.getByPlaceholder("Что изменяет: КД, Ловкость, сопротивление…").fill("доспех");
  await page.getByRole("button", { name: /Класс доспеха/ }).first().click();
  await dialog.getByPlaceholder("2, 1d4, PROF, 13 + DEX").fill("1");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  await expect(ac).toContainText("13");

  // Counters ask what the gain is for.
  await tab(page, "Счётчики").click();
  await page.getByRole("button", { name: "Счётчик", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Название").fill("Рубины");
  await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
  await page.getByRole("button", { name: "Увеличить" }).click();
  const prompt = page.getByRole("dialog");
  await prompt.getByLabel("За что получено").fill("Нашли в сундуке");
  await prompt.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByRole("button", { name: "Рубины: 1" })).toBeVisible();

  // Unused mechanics can be hidden.
  await expect(page.locator("aside").getByText("Религия")).toBeVisible();
  await tab(page, "Настройки").click();
  await page.getByRole("checkbox", { name: /Религия/ }).uncheck();
  await expect(page.locator("aside").getByText("Религия")).toHaveCount(0);

  // Everything survives a reload.
  await waitSaved(page);
  await page.reload();
  await expect(page.getByRole("group", { name: "КД" })).toContainText("13");
  await expect(page.locator("aside").getByText("Религия")).toHaveCount(0);
  await tab(page, "Журнал").click();
  await expect(page.getByText("Нашли в сундуке")).toBeVisible();
  await expect(page.getByText(/Плащ защиты/).first()).toBeVisible();
});

test("imports a Long Story Short export", async ({ page }) => {
  await signIn(page);
  await page.goto("/characters/import");
  await page.locator('input[type="file"]').setInputFiles(join(__dirname, "..", "src", "lib", "import", "__tests__", "fixtures", "lss-wizard.json"));
  await expect(page.getByLabel("Имя")).toHaveValue("Тестовый волшебник");
  await page.getByRole("button", { name: "Создать персонажа" }).click();
  await expect(page).toHaveURL(/\/characters\/[\w-]+$/);
  await expect(page.getByRole("group", { name: "КД" })).toContainText("11");
  await tab(page, "Заклинания").click();
  await expect(page.getByText(/СЛ/).first()).toBeVisible();

  // Spells exported as bare ids are matched by name; headings give levels to the ones not found.
  await page.getByRole("button", { name: "Сопоставить" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Названия, по одному в строке").fill("Заговоры\nИскорка мастера\n3 уровень\nЛазер [Laser]");
  await dialog.getByRole("button", { name: "Найти" }).click();
  await expect(dialog.getByText("Найдено 0 из 2.")).toBeVisible();
  await expect(dialog.getByText("· 3 ур.")).toBeVisible();
  await dialog.getByRole("button", { name: "Добавить найденные" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/нераспознанных заклинаний/)).toHaveCount(0);
  await expect(page.getByText("Лазер", { exact: true })).toBeVisible();
  await expect(page.getByText("Искорка мастера", { exact: true })).toBeVisible();
});

test("spell library: own spells and admin upload", async ({ page }) => {
  await signIn(page);
  await page.goto("/spells");
  await page.getByRole("button", { name: "Своё заклинание" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название", { exact: true }).fill("Искра испытателя");
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(page.getByText("Искра испытателя")).toBeVisible();

  await page.goto("/spells/import");
  const isAdmin = await page.getByRole("heading", { name: "Загрузка заклинаний" }).isVisible();
  test.skip(!isAdmin, "The account is not the site admin (database was not empty)");
  const spells = [1, 2].map((n) => ({
    source: "dndsu",
    externalId: `e2e-${n}`,
    url: `https://dnd.su/spells/e2e-${n}/`,
    nameRu: `Тестовое заклинание ${n}`,
    level: n,
    classes: ["волшебник"],
    description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Описание" }] }] },
  }));
  await page.locator('input[type="file"]').setInputFiles({
    name: "spells.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "dnd-web-spells", spells })),
  });
  await expect(page.getByText(/Новых: 2/)).toBeVisible();
  await page.goto("/spells");
  await page.getByPlaceholder("Название по-русски или по-английски").fill("Тестовое заклинание");
  await expect(page.getByText("Тестовое заклинание 2")).toBeVisible();
});
