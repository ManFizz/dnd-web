"use client";

import { useCallback, useState } from "react";
import { newAttack, newCounter, newEffect, newFeature, newItem } from "@/lib/rules/defaults";
import { opsForTarget, targetDef } from "@/lib/rules/targets";
import { SheetDialogsContext, type DialogRequest } from "./dialogs-context";
import { AttackDialog, BonusDialog, CounterDialog, FeatureDialog, ItemDialog, OverrideDialog } from "./editors";
import { RestDialog } from "./rest-dialog";
import { CastDialog, CustomSpellDialog, SpellEntryDialog, SpellLibraryDialog, SpellMatchDialog } from "./spell-dialogs";

function bonusFor(target: string) {
  const op = opsForTarget(target)[0];
  const kind = targetDef(target)?.kind;
  return newEffect({ target, op, value: kind === "prof" ? "1" : kind === "grant" ? "" : "1" });
}

export function SheetDialogs({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<(DialogRequest & { seq: number }) | null>(null);
  const open = useCallback((r: DialogRequest) => setReq({ ...r, seq: Date.now() }), []);
  const close = useCallback(() => setReq(null), []);
  let dialog: React.ReactNode = null;
  if (req) {
    const key = req.seq;
    switch (req.kind) {
      case "bonus":
        dialog = <BonusDialog key={key} initial={req.effect ?? bonusFor(req.target ?? "ability.str.score")} isNew={!req.effect} onClose={close} />;
        break;
      case "override":
        dialog = <OverrideDialog key={key} statKey={req.key} title={req.title} current={req.current} onClose={close} />;
        break;
      case "feature":
        dialog = <FeatureDialog key={key} initial={req.feature ?? newFeature(req.preset)} isNew={!req.feature} onClose={close} />;
        break;
      case "item":
        dialog = <ItemDialog key={key} initial={req.item ?? newItem(req.preset)} isNew={!req.item} onClose={close} />;
        break;
      case "attack":
        dialog = <AttackDialog key={key} initial={req.attack ?? newAttack({ name: "" })} isNew={!req.attack} onClose={close} />;
        break;
      case "counter":
        dialog = <CounterDialog key={key} initial={req.counter ?? newCounter({ name: "" })} isNew={!req.counter} onClose={close} />;
        break;
      case "spell-library":
        dialog = <SpellLibraryDialog key={key} onClose={close} />;
        break;
      case "spell-entry":
        dialog = <SpellEntryDialog key={key} entryId={req.entryId} onClose={close} />;
        break;
      case "spell-custom":
        dialog = <CustomSpellDialog key={key} onClose={close} />;
        break;
      case "spell-match":
        dialog = <SpellMatchDialog key={key} onClose={close} />;
        break;
      case "cast":
        dialog = <CastDialog key={key} entryId={req.entryId} onClose={close} />;
        break;
      case "rest":
        dialog = <RestDialog key={key} kind={req.rest} onClose={close} />;
        break;
    }
  }
  return (
    <SheetDialogsContext value={open}>
      {children}
      {dialog}
    </SheetDialogsContext>
  );
}
