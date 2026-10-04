"use client";

import { Dices, Moon, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { applyRest } from "@/lib/rules/rest";
import type { CharacterDoc } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Modal } from "@/components/ui/overlay";
import { useRoll } from "./dice";
import { makeEvent, useChange, useComputed, useDoc, useSheetApi } from "./store";

export function RestDialog({ kind, onClose }: { kind: "short" | "long"; onClose: () => void }) {
  const doc = useDoc();
  const sheet = useComputed();
  const change = useChange();
  const roll = useRoll();
  const api = useSheetApi();
  const [dawn, setDawn] = useState(kind === "long");
  const conMod = sheet.abilities.con.mod;
  const hpMax = sheet.hpMax.value;

  const preview = useMemo(() => {
    const copy = JSON.parse(JSON.stringify(doc)) as CharacterDoc;
    return applyRest(copy, kind, { dawn });
  }, [doc, kind, dawn]);

  const spendDie = (die: number) => {
    const r = roll({ label: `Кость хитов к${die}`, value: { n: conMod, dice: [{ count: 1, sides: die, sign: 1 }] } });
    const heal = Math.max(0, r.result.total);
    // Fresh state: several dice can be spent before the next render.
    const before = api.getState().doc.combat.hpCurrent;
    const after = Math.min(hpMax, before + heal);
    change(
      (d) => {
        d.combat.hitDiceUsed[String(die)] = (d.combat.hitDiceUsed[String(die)] ?? 0) + 1;
        d.combat.hpCurrent = after;
      },
      makeEvent("hp", `Кость хитов к${die}: +${heal} (хиты ${before} → ${after})`),
    );
  };

  const finish = () => {
    change(
      (d) => {
        applyRest(d as CharacterDoc, kind, { dawn });
      },
      makeEvent("rest", `${kind === "short" ? "Короткий" : "Длинный"} отдых${preview.length ? `: ${preview.join("; ")}` : ""}`),
    );
    onClose();
  };

  return (
    <Modal
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={kind === "short" ? "Короткий отдых" : "Длинный отдых"}
      description={kind === "short" ? "Можно потратить кости хитов, чтобы восстановить хиты." : "Хиты, ячейки и способности восстановятся."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={finish}>
            {kind === "short" ? <Sun /> : <Moon />}
            Завершить отдых
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-lg bg-panel-2 px-3 py-2">
          <span className="text-sm text-muted">Хиты</span>
          <span className="font-display text-xl font-bold tabular-nums">
            {doc.combat.hpCurrent} / {hpMax}
          </span>
        </div>
        {kind === "short" && !doc.settings.hidden.includes("combat.hitDice") && (
          <div className="flex flex-col gap-2">
            {sheet.hitDice.map((d) => (
              <div key={d.die} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <div>
                  <div className="font-medium">к{d.die}</div>
                  <div className="text-xs text-muted">
                    осталось {d.total - d.used} из {d.total} · бросок к{d.die}
                    {conMod ? ` ${conMod > 0 ? "+" : "−"} ${Math.abs(conMod)}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="subtle" disabled={d.used >= d.total || doc.combat.hpCurrent >= hpMax} onClick={() => spendDie(d.die)}>
                  <Dices /> Потратить
                </Button>
              </div>
            ))}
            {!sheet.hitDice.length && <p className="text-sm text-muted">У персонажа нет классов, поэтому нет и костей хитов.</p>}
          </div>
        )}
        {kind === "long" && <Checkbox checked={dawn} onChange={(e) => setDawn(e.target.checked)} label="Наступил рассвет (восстановить то, что восполняется на рассвете)" />}
        <div>
          <div className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Что изменится</div>
          {preview.length ? (
            <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
              {preview.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Восстанавливать нечего.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
