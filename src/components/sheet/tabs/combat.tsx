"use client";

import { Plus, Sparkles } from "lucide-react";
import { ABILITY_LABELS } from "@/lib/rules/constants";
import { formatStat } from "@/lib/rules/compute";
import { Button } from "@/components/ui/button";
import { Empty, Panel } from "@/components/ui/misc";
import { AttackLine } from "../attacks";
import { CounterCard } from "./counters";
import { useOpenDialog } from "../dialogs-context";
import { UsesControl } from "../feature-list";
import { ItemCharges } from "./inventory";
import { SlotsEditor } from "./spells";
import { StatPopover } from "../stat";
import { useComputed, useDoc } from "../store";

export function CombatTab({ onTab }: { onTab: (tab: string) => void }) {
  const sheet = useComputed();
  const doc = useDoc();
  const open = useOpenDialog();

  const editAttack = (rowId: string) => {
    const own = doc.attacks.find((a) => a.id === rowId);
    if (own) return () => open({ kind: "attack", attack: own });
    const weaponItem = doc.items.find((i) => `item-${i.id}` === rowId || i.attacks.some((a) => a.id === rowId));
    if (weaponItem) return () => open({ kind: "item", item: weaponItem });
    const feature = doc.features.find((f) => f.attacks.some((a) => a.id === rowId));
    if (feature) return () => open({ kind: "feature", feature });
    return undefined;
  };

  const usesFeatures = doc.features.filter((f) => f.active && f.uses);
  const chargedItems = doc.items.filter((i) => i.charges);
  const pinned = doc.counters.filter((c) => c.pinned);
  const hasResources = usesFeatures.length + chargedItems.length + pinned.length > 0;
  const showSpells = sheet.spell.hasCasting && !doc.settings.hidden.includes("tab.spells");

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Атаки и действия"
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="ghost" onClick={() => open({ kind: "attack" })}>
            <Plus /> Атака
          </Button>
        }
      >
        {sheet.attacks.length ? (
          sheet.attacks.map((row) => <AttackLine key={row.id} row={row} onEdit={editAttack(row.id)} />)
        ) : (
          <div className="p-4">
            <Empty title="Атак пока нет">Оружие из снаряжения появится здесь само. Своё — когти, дыхание, особый удар — добавьте кнопкой «Атака».</Empty>
          </div>
        )}
      </Panel>

      {showSpells && (
        <Panel
          title="Заклинательство"
          actions={
            <Button size="sm" variant="ghost" onClick={() => onTab("spells")}>
              <Sparkles /> Заклинания
            </Button>
          }
        >
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted">Характеристика </span>
              <span className="font-semibold">{ABILITY_LABELS[sheet.spell.ability].short}</span>
            </div>
            <StatPopover
              title="Сложность спасброска"
              stat={sheet.spell.dc}
              signed={false}
              trigger={
                <button type="button" className="hover:text-accent">
                  <span className="text-muted">СЛ </span>
                  <span className="font-semibold">{sheet.spell.dc.value}</span>
                </button>
              }
            />
            <StatPopover
              title="Атака заклинанием"
              stat={sheet.spell.attack}
              rollLabel="Атака заклинанием"
              trigger={
                <button type="button" className="hover:text-accent">
                  <span className="text-muted">Атака </span>
                  <span className="font-semibold">{formatStat(sheet.spell.attack)}</span>
                </button>
              }
            />
          </div>
          <SlotsEditor compact />
        </Panel>
      )}

      {hasResources && (
        <Panel title="Ресурсы">
          <div className="grid gap-2 sm:grid-cols-2">
            {usesFeatures.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <button type="button" className="min-w-0 truncate text-left text-sm hover:text-accent" onClick={() => open({ kind: "feature", feature: f })}>
                  {f.name}
                </button>
                <UsesControl feature={f} />
              </div>
            ))}
            {chargedItems.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <button type="button" className="min-w-0 truncate text-left text-sm hover:text-accent" onClick={() => open({ kind: "item", item: i })}>
                  {i.name}
                </button>
                <ItemCharges item={i} />
              </div>
            ))}
          </div>
          {pinned.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pinned.map((c) => (
                <CounterCard key={c.id} counter={c} />
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

