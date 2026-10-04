import { BookOpenText, Dna, Hash, History, Sigma, Sparkles, SwatchBook, ToggleLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/app";
import { getSessionUser } from "@/lib/server/session";

const FEATURES = [
  {
    icon: SwatchBook,
    title: "Предметы, которые считают сами",
    text: "Пропишите предмету бонусы, сопротивления или преимущество, и лист пересчитается, когда вы его наденете.",
  },
  { icon: Dna, title: "Мутации", text: "Руки, ноги и глаза других рас со своими статами и способностями. Работают как предметы, но привязаны к телу." },
  { icon: History, title: "Журнал с причинами", text: "Каждое ручное изменение подписано: за что получено золото, откуда бонус, почему хиты задали руками." },
  { icon: Sigma, title: "Формулы в тексте", text: "Пишите {1к4+ЛОВ} или {8+БМ+ИНТ} прямо в описании, и лист покажет число и даст бросить кубы." },
  { icon: Sparkles, title: "Заклинания dnd.su", text: "Общая библиотека заклинаний, свои заклинания и правки существующих только для одного персонажа." },
  { icon: Hash, title: "Счётчики", text: "Сухпайки, рубины, стрелы, долги. Любой счётчик можно использовать в формулах." },
  { icon: ToggleLeft, title: "Лишнее можно выключить", text: "Не пользуетесь Религией, щитом или электрумом? Спрячьте их в настройках персонажа." },
  { icon: BookOpenText, title: "Импорт из Long Story Short", text: "Загрузите экспорт персонажа, и он появится здесь со всеми бонусами, предметами и заметками." },
];

export default async function Home() {
  if (await getSessionUser()) redirect("/characters");
  return (
    <div className="flex flex-col gap-12 py-6">
      <section className="flex flex-col items-start gap-5">
        <h1 className="max-w-2xl font-display text-4xl leading-tight font-bold sm:text-5xl">{APP_NAME}: лист персонажа D&D 5e, где каждая цифра объяснима</h1>
        <p className="max-w-2xl text-lg text-muted">
          Автоматика считает модификаторы, КД, ячейки и бонусы предметов, а вы в любой момент можете поправить что угодно руками. Каждое такое
          изменение остаётся в журнале с подписью.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" variant="primary">
            <Link href="/register">Создать аккаунт</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Войти</Link>
          </Button>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-line bg-panel p-4">
            <f.icon className="mb-2 size-5 text-accent" />
            <h2 className="mb-1 font-semibold">{f.title}</h2>
            <p className="text-sm text-muted">{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
