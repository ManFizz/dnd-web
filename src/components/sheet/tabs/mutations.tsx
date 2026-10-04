"use client";

import { Dna, Plus } from "lucide-react";
import { BODY_PARTS } from "@/lib/rules/constants";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/misc";
import { useOpenDialog } from "../dialogs-context";
import { FeatureCard } from "../feature-list";
import { useDoc } from "../store";

export function MutationsTab() {
  const doc = useDoc();
  const open = useOpenDialog();
  const mutations = doc.features.filter((f) => f.kind === "mutation");
  const byPart = new Map<string, typeof mutations>();
  for (const m of mutations) {
    const part = BODY_PARTS.some((p) => p.id === m.bodyPart) ? m.bodyPart : "other";
    byPart.set(part, [...(byPart.get(part) ?? []), m]);
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted">
          Части тела от других рас и существ. Каждая мутация — как предмет: свои бонусы, атаки, использования и описание. Выключенная мутация не даёт бонусов.
        </p>
        <Button variant="primary" onClick={() => open({ kind: "feature", preset: { kind: "mutation", bodyPart: "arms", source: "Мутация" } })}>
          <Plus /> Мутация
        </Button>
      </div>
      {mutations.length === 0 ? (
        <Empty icon={<Dna />} title="Мутаций нет">
          Например: «Ноги сатира» (часть тела: ноги, от: сатир) с эффектом «Скорость: ходьба +5» и атакой «Удар копытом 1d4».
        </Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {BODY_PARTS.filter((p) => byPart.has(p.id)).map((p) => (
            <section key={p.id} className="flex flex-col gap-2 rounded-xl border border-line bg-panel-2/50 p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold">{p.label}</h3>
                <Button size="xs" variant="ghost" onClick={() => open({ kind: "feature", preset: { kind: "mutation", bodyPart: p.id, source: "Мутация" } })}>
                  <Plus /> Ещё
                </Button>
              </div>
              {byPart.get(p.id)!.map((m) => (
                <FeatureCard key={m.id} feature={m} />
              ))}
            </section>
          ))}
        </div>
      )}
      {mutations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {BODY_PARTS.filter((p) => !byPart.has(p.id)).map((p) => (
            <Button key={p.id} size="xs" variant="outline" onClick={() => open({ kind: "feature", preset: { kind: "mutation", bodyPart: p.id, source: "Мутация" } })}>
              <Plus /> {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
