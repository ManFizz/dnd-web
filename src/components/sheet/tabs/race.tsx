"use client";

import { Wand2 } from "lucide-react";
import { SIZES, SIZE_LABELS, SPEED_LABELS, SPEED_TYPES, type Size } from "@/lib/rules/constants";
import { applyRacePreset } from "@/lib/rules/presets";
import type { CharacterDoc } from "@/lib/rules/schema";
import { RACE_PRESETS } from "@/lib/rules/tables";
import { RichEditor } from "@/components/rich/editor";
import { Button } from "@/components/ui/button";
import { CommitInput, Field, NumberInput, Select } from "@/components/ui/input";
import { Panel } from "@/components/ui/misc";
import { Menu } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { FeatureList } from "../feature-list";
import { makeEvent, useChange, useDoc } from "../store";

export function RaceTab() {
  const doc = useDoc();
  const change = useChange();
  const ask = useAsk();
  const features = doc.features.filter((f) => f.kind === "race");
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Раса"
        actions={
          <Menu
            trigger={
              <Button size="sm" variant="ghost">
                <Wand2 /> Шаблон расы
              </Button>
            }
            items={RACE_PRESETS.map((p) => ({
              label: p.name,
              onSelect: async () => {
                const ok = await ask.confirm({
                  title: `Применить шаблон «${p.name}»?`,
                  description: "Добавятся расовые особенности с бонусами, языки, размер и скорость. Уже существующие особенности останутся.",
                  confirmLabel: "Применить",
                });
                if (!ok) return;
                change((d) => applyRacePreset(d as CharacterDoc, p), makeEvent("edit", `Применён шаблон расы «${p.name}»`));
              },
            }))}
          />
        }
      >
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Раса" hint="Например: Проклятокровый, Тифлинг (Асмодей)">
            <CommitInput
              value={doc.info.race}
              onCommit={(race) =>
                change(
                  (d) => {
                    d.info.race = race;
                  },
                  makeEvent("edit", `Раса: ${race}`),
                )
              }
            />
          </Field>
          <Field label="Размер">
            <Select
              value={doc.info.size}
              onChange={(e) =>
                change(
                  (d) => {
                    d.info.size = e.target.value as Size;
                  },
                  makeEvent("edit", `Размер: ${SIZE_LABELS[e.target.value as Size]}`),
                )
              }
              options={SIZES.map((s) => ({ value: s, label: SIZE_LABELS[s] }))}
            />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SPEED_TYPES.map((s) => (
            <Field key={s} label={SPEED_LABELS[s]} hint={s === "walk" ? "базовая, фт." : undefined}>
              <NumberInput
                value={doc.combat.speed[s]}
                min={0}
                max={10000}
                onCommit={(v) =>
                  change(
                    (d) => {
                      d.combat.speed[s] = v;
                    },
                    makeEvent("edit", `Базовая скорость (${SPEED_LABELS[s].toLowerCase()}): ${v} фт.`),
                  )
                }
              />
            </Field>
          ))}
        </div>
      </Panel>
      <Panel title="Расовые особенности">
        <FeatureList
          features={features}
          preset={{ kind: "race", source: doc.info.race ? `Раса: ${doc.info.race}` : "Раса" }}
          addLabel="Расовая особенность"
          emptyTitle="Расовых особенностей нет"
          emptyText="Добавьте их вручную или примените шаблон расы. Особенности могут давать бонусы: тёмное зрение, сопротивления, +2 к характеристике."
        />
      </Panel>
      <Panel title="О расе">
        <RichEditor
          value={doc.lore.race}
          debounceMs={1200}
          placeholder="История народа, обычаи, внешние черты…"
          onChange={(v) =>
            change((d) => {
              d.lore.race = v;
            })
          }
        />
      </Panel>
    </div>
  );
}
