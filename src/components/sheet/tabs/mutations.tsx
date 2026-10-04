"use client";

import { Dna, Plus } from "lucide-react";
import { MUTATION_PARTS } from "@/lib/mutations";
import type { Feature } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/misc";
import { useOpenDialog } from "../dialogs-context";
import { FeatureCard } from "../feature-list";
import { useVisibleEntries } from "../grant-badge";
import { useDoc } from "../store";

// "Тело": the five body parts of the mutation table. Each part shows what
// replaced it; an empty part is the character's own.

/** Older finer body parts fold into the five slots. */
const SLOT_OF: Record<string, string> = {
  head: "head",
  eyes: "head",
  mouth: "head",
  torso: "torso",
  skin: "torso",
  arms: "arms",
  hands: "arms",
  legs: "legs",
  tail: "tail",
  wings: "tail",
};

export function MutationsTab() {
  const doc = useDoc();
  const open = useOpenDialog();
  const mutations = useVisibleEntries(doc.features.filter((f) => f.kind === "mutation"));
  const bySlot = new Map<string, Feature[]>();
  for (const m of mutations) {
    const slot = SLOT_OF[m.bodyPart] ?? "other";
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), m]);
  }
  const add = (bodyPart: string) => open({ kind: "feature", preset: { kind: "mutation", bodyPart, source: "Мутация" } });
  const other = bySlot.get("other") ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted">
        Части тела от других существ. Каждая мутация как предмет: свои бонусы, атаки, использования и описание. Новая мутация на ту же часть тела полностью
        заменяет старую.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MUTATION_PARTS.map((p) => {
          const list = bySlot.get(p.id) ?? [];
          return (
            <section key={p.id} className="flex flex-col gap-2 rounded-xl border border-line bg-panel-2/50 p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold">{p.label}</h3>
                <Button size="xs" variant="ghost" onClick={() => add(p.id)}>
                  <Plus /> Мутация
                </Button>
              </div>
              {list.length ? list.map((m) => <FeatureCard key={m.id} feature={m} />) : <p className="text-sm text-faint">Своё, без мутаций</p>}
            </section>
          );
        })}
        {other.length > 0 && (
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-panel-2/50 p-3">
            <h3 className="font-display text-base font-bold">Другое</h3>
            {other.map((m) => (
              <FeatureCard key={m.id} feature={m} />
            ))}
          </section>
        )}
      </div>
      {mutations.length === 0 && (
        <Empty icon={<Dna />} title="Мутаций нет">
          Мутации выдаёт ГМ (например, после воскрешения), но их можно добавить и самому: «Ноги сатира» с эффектом «Скорость: ходьба +5» и атакой «Удар копытом
          1d4».
        </Empty>
      )}
    </div>
  );
}
