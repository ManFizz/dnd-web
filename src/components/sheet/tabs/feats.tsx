"use client";

import { Panel } from "@/components/ui/misc";
import { FeatureList } from "../feature-list";
import { useDoc } from "../store";

export function FeatsTab() {
  const doc = useDoc();
  const feats = doc.features.filter((f) => f.kind === "feat");
  const boons = doc.features.filter((f) => f.kind === "boon" || f.kind === "other");
  const background = doc.features.filter((f) => f.kind === "background");
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Черты">
        <FeatureList
          features={feats}
          preset={{ kind: "feat", source: "Черта" }}
          addLabel="Черта"
          emptyTitle="Черт пока нет"
          emptyText="Черта может давать бонусы (например, +1 к Интеллекту и владение спасброском), атаки и использования."
        />
      </Panel>
      <Panel title="Дары и прочее">
        <FeatureList
          features={boons}
          preset={{ kind: "boon", source: "" }}
          addLabel="Дар или особенность"
          emptyTitle="Ничего нет"
          emptyText="Благословения, проклятия, эпические дары, награды мастера."
        />
      </Panel>
      <Panel title="Предыстория">
        <FeatureList
          features={background}
          preset={{ kind: "background", source: doc.info.background ? `Предыстория: ${doc.info.background}` : "Предыстория" }}
          addLabel="Умение предыстории"
          emptyTitle="Умений предыстории нет"
        />
      </Panel>
    </div>
  );
}
