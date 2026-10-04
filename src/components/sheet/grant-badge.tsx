"use client";

import { Crown, Lock, Skull } from "lucide-react";
import { EXPIRY_LABELS } from "@/lib/grants";
import type { GrantMark } from "@/lib/rules/schema";
import { Badge } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { useReadOnly } from "@/components/ui/read-only";

// How a GM grant looks on the sheet: a small badge with the reason, and the
// masking of what the GM keeps secret from the player.

export type GrantView = {
  /** Not shown to the player at all (the GM sees it in their view). */
  hidden: boolean;
  /** Name only; the properties read "???". */
  masked: boolean;
};

export function useGrantView(grant: GrantMark | null | undefined): GrantView {
  const gmView = useReadOnly();
  if (!grant || gmView) return { hidden: false, masked: false };
  return { hidden: grant.visibility === "hidden", masked: grant.visibility === "masked" };
}

/** Filter for lists: drops hidden grants for the player. */
export function useVisibleEntries<T extends { grant?: GrantMark | null }>(list: T[]): T[] {
  const gmView = useReadOnly();
  return gmView ? list : list.filter((x) => x.grant?.visibility !== "hidden");
}

function timer(g: GrantMark): string {
  if (g.expires === "rounds") return `осталось раундов: ${g.left}`;
  if (g.expires === "days") return `осталось дней: ${g.left}`;
  return EXPIRY_LABELS[g.expires].toLowerCase();
}

export function GrantBadge({ grant }: { grant: GrantMark | null | undefined }) {
  const gmView = useReadOnly();
  if (!grant) return null;
  const secret = grant.visibility !== "visible";
  const cursed = grant.cursed && (gmView || !secret);
  return (
    <Tip
      content={
        <div className="flex max-w-xs flex-col gap-0.5">
          <span>Выдано ГМом{grant.reason ? `: ${grant.reason}` : ""}</span>
          {grant.expires !== "never" && <span className="text-faint">Срок: {timer(grant)}</span>}
          {grant.lock !== "none" && <span className="text-faint">{grant.lock === "noremove" ? "Нельзя менять и убрать" : "Нельзя менять"}</span>}
          {grant.removal && <span className="text-faint">Как избавиться: {grant.removal}</span>}
          {gmView && secret && <span className="text-faint">Игрок видит: {grant.visibility === "hidden" ? "ничего" : "только название"}</span>}
          {gmView && grant.stages > 1 && (
            <span className="text-faint">
              Стадия {grant.stage + 1} из {grant.stages}
            </span>
          )}
        </div>
      }
    >
      <span className="inline-flex">
        <Badge tone={cursed ? "danger" : "accent"}>
          {cursed ? <Skull className="size-3" /> : grant.lock !== "none" ? <Lock className="size-3" /> : <Crown className="size-3" />}
          {cursed ? "проклято" : "от ГМа"}
          {grant.expires === "rounds" || grant.expires === "days" ? ` · ${grant.left}` : ""}
        </Badge>
      </span>
    </Tip>
  );
}

/** Stand-in for the properties of a masked grant. */
export function MaskedText({ className }: { className?: string }) {
  return <span className={className ?? "text-xs text-faint italic"}>Свойства неизвестны</span>;
}
