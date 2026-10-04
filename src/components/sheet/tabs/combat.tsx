"use client";

import { Plus, Sparkles } from "lucide-react";
import { ABILITY_LABELS } from "@/lib/rules/constants";
import { formatStat } from "@/lib/rules/compute";
import { STAT_INFO } from "@/lib/rules/glossary";
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
          <div className="mb-3 flex flex-col gap-1.5 text-sm">
            {(sheet.spell.byClass.length > 1
              ? sheet.spell.byClass
              : [{ id: "", name: "", ability: sheet.spell.ability, dc: sheet.spell.dc, attack: sheet.spell.attack }]
            ).map((c) => (
              <div key={c.id} className="flex flex-wrap gap-x-4 gap-y-1">
                {c.name && <span className="min-w-24 font-medium">{c.name}</span>}
                <div>
                  <span className="text-muted">Характеристика </span>
                  <span className="font-semibold">{ABILITY_LABELS[c.ability].short}</span>
                </div>
                <StatPopover
                  title={c.name ? `СЛ заклинаний: ${c.name}` : "Сложность спасброска"}
                  stat={c.dc}
                  signed={false}
                  info={STAT_INFO.spellDc}
                  bonusTarget="spell.dc"
                  trigger={
                    <button type="button" className="hover:text-accent">
                      <span className="text-muted">СЛ </span>
                      <span className="font-semibold">{c.dc.value}</span>
                    </button>
                  }
                />
                <StatPopover
                  title={c.name ? `Атака заклинанием: ${c.name}` : "Атака заклинанием"}
                  stat={c.attack}
                  info={STAT_INFO.spellAttack}
                  bonusTarget="spell.attack"
                  rollLabel={c.name ? `Атака заклинанием (${c.name})` : "Атака заклинанием"}
                  trigger={
                    <button type="button" className="hover:text-accent">
                      <span className="text-muted">Атака </span>
                      <span className="font-semibold">{formatStat(c.attack)}</span>
                    </button>
                  }
                />
              </div>
            ))}
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

