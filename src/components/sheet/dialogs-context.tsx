"use client";

import { createContext, use } from "react";
import type { Attack, Counter, Effect, Feature, Item } from "@/lib/rules/schema";

// Sheet-level dialogs are opened through this context and rendered once at the
// sheet root, so a dialog survives the popover or menu that opened it.

export type DialogRequest =
  | { kind: "bonus"; effect?: Effect; target?: string }
  | { kind: "override"; key: string; title: string; current: number }
  | { kind: "feature"; feature?: Feature; preset?: Partial<Feature> }
  | { kind: "item"; item?: Item; preset?: Partial<Item> }
  | { kind: "attack"; attack?: Attack }
  | { kind: "counter"; counter?: Counter }
  | { kind: "spell-library" }
  | { kind: "spell-entry"; entryId: string }
  | { kind: "spell-custom" }
  | { kind: "spell-match" }
  | { kind: "cast"; entryId: string }
  | { kind: "rest"; rest: "short" | "long" }
  | { kind: "add-class" }
  | { kind: "level-up"; classId?: string };

export const SheetDialogsContext = createContext<(req: DialogRequest) => void>(() => {});

export function useOpenDialog() {
  return use(SheetDialogsContext);
}
