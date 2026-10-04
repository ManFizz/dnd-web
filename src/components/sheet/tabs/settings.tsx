"use client";

import { Download, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { characterExport, downloadJson } from "@/lib/download";
import { HIDEABLE } from "@/lib/rules/hideable";
import { safeParseCharacterDoc } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { Checkbox, Switch } from "@/components/ui/input";
import { Panel, Segmented } from "@/components/ui/misc";
import { useAsk } from "@/components/ui/prompt";
import { makeEvent, useChange, useDoc } from "../store";

export function SettingsTab() {
  const doc = useDoc();
  const change = useChange();
  const ask = useAsk();
  const fileRef = useRef<HTMLInputElement>(null);
  const hidden = new Set(doc.settings.hidden);

  const toggle = (key: string, label: string, show: boolean) =>
    change(
      (d) => {
        d.settings.hidden = show ? d.settings.hidden.filter((k) => k !== key) : [...d.settings.hidden, key];
      },
      makeEvent("settings", `${show ? "Показано" : "Скрыто"}: ${label}`),
    );

  const exportJson = () => downloadJson(`${doc.name || "character"}.json`, characterExport(doc));

  const importJson = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as { doc?: unknown };
      const parsed = safeParseCharacterDoc(raw && typeof raw === "object" && "doc" in raw ? raw.doc : raw);
      if (!parsed.success) throw new Error("Файл не похож на персонажа из «Листа героя»");
      const ok = await ask.confirm({
        title: `Заменить персонажа данными из «${file.name}»?`,
        description: "Текущий лист будет полностью заменён. Журнал сохранится. Отменить можно кнопкой «Отменить» в шапке.",
        confirmLabel: "Заменить",
        danger: true,
      });
      if (!ok) return;
      change(() => parsed.data, makeEvent("import", `Лист заменён из файла «${file.name}»`));
      toast.success("Персонаж загружен из файла");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось прочитать файл");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Правила">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Редакция правил</div>
              <div className="text-xs text-muted">Влияет на истощение и восстановление костей хитов.</div>
            </div>
            <Segmented
              value={doc.settings.edition}
              onChange={(edition) =>
                change(
                  (d) => {
                    d.settings.edition = edition;
                  },
                  makeEvent("settings", `Редакция правил: ${edition}`),
                )
              }
              options={[
                { value: "2014", label: "5e (2014)" },
                { value: "2024", label: "5e (2024)" },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Обязательные подписи</div>
              <div className="text-xs text-muted">
                Спрашивать «за что получено» при бонусах, монетах, опыте, счётчиках, вдохновении и смене базовых значений. Ручные значения требуют причину всегда.
              </div>
            </div>
            <Switch
              checked={doc.settings.requireReasons}
              onCheckedChange={(requireReasons) =>
                change(
                  (d) => {
                    d.settings.requireReasons = requireReasons;
                  },
                  makeEvent("settings", requireReasons ? "Подписи к изменениям обязательны" : "Подписи к изменениям необязательны"),
                )
              }
            />
          </div>
        </div>
      </Panel>
      <Panel title="Что показывать">
        <p className="mb-4 text-sm text-muted">Снимите галочку с механик, которыми не пользуетесь: они исчезнут из листа. Данные не удаляются, их можно вернуть в любой момент.</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {HIDEABLE.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{g.title}</div>
              <div className="flex flex-col gap-1.5">
                {g.items.map((it) => (
                  <Checkbox
                    key={it.key}
                    checked={!hidden.has(it.key)}
                    onChange={(e) => toggle(it.key, it.label, e.target.checked)}
                    label={
                      <span>
                        {it.label}
                        {it.hint && <span className="block text-xs text-faint">{it.hint}</span>}
                      </span>
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Файл персонажа">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportJson}>
            <Download /> Скачать JSON
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Загрузить из JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importJson(f);
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">Резервная копия или перенос на другой аккаунт. Импорт из Long Story Short — на странице «Импорт» в списке персонажей.</p>
      </Panel>
    </div>
  );
}
