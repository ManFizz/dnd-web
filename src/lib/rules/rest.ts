import { Calculator, hitDiceSummary } from "./compute";
import { expireOnRest } from "./grant-rules";
import type { CharacterDoc, Counter } from "./schema";

export type RestKindToApply = "short" | "long";

/**
 * Apply a short or long rest to a (mutable) document. Returns a list of
 * human-readable changes for the journal.
 */
export function applyRest(doc: CharacterDoc, kind: RestKindToApply, opts: { dawn?: boolean } = {}): string[] {
  // JSON clone: works for plain objects and for immer drafts alike.
  const calc = new Calculator(JSON.parse(JSON.stringify(doc)) as CharacterDoc);
  const changes: string[] = [];
  const resets = new Set<string>(kind === "short" ? ["short"] : ["short", "long"]);
  if (opts.dawn) resets.add("dawn");

  for (const c of doc.counters) {
    if (!resets.has(c.reset)) continue;
    const target = counterResetValue(calc, c);
    if (target !== null && target !== c.value) {
      changes.push(`${c.name}: ${c.value} → ${target}`);
      c.value = target;
    }
  }
  for (const f of doc.features) {
    if (f.uses && resets.has(f.uses.reset) && f.uses.used > 0) {
      changes.push(`${f.name}: использования восстановлены`);
      f.uses.used = 0;
    }
  }
  for (const i of doc.items) {
    if (i.charges && resets.has(i.charges.reset) && i.charges.used > 0) {
      changes.push(`${i.name}: заряды восстановлены`);
      i.charges.used = 0;
    }
  }
  if (doc.spellcasting.pactUsed > 0) {
    changes.push("Ячейки договора восстановлены");
    doc.spellcasting.pactUsed = 0;
  }

  if (kind === "long") {
    const max = calc.value("hp.max");
    if (doc.combat.hpCurrent !== max) changes.push(`Хиты: ${doc.combat.hpCurrent} → ${max}`);
    doc.combat.hpCurrent = max;
    if (doc.combat.hpTemp) changes.push("Временные хиты сброшены");
    doc.combat.hpTemp = 0;
    if (doc.spellcasting.slotsUsed.some((x) => x > 0)) changes.push("Ячейки заклинаний восстановлены");
    doc.spellcasting.slotsUsed = doc.spellcasting.slotsUsed.map(() => 0);
    doc.combat.deathSuccesses = 0;
    doc.combat.deathFailures = 0;

    // Hit dice: 2024 restores all, 2014 restores half of the total (at least one).
    const summary = hitDiceSummary(doc);
    const totalDice = summary.reduce((a, d) => a + d.total, 0);
    let toRestore = doc.settings.edition === "2024" ? totalDice : Math.max(1, Math.floor(totalDice / 2));
    let restored = 0;
    for (const d of summary) {
      const key = String(d.die);
      const used = doc.combat.hitDiceUsed[key] ?? 0;
      const back = Math.min(used, toRestore);
      if (back > 0) {
        doc.combat.hitDiceUsed[key] = used - back;
        toRestore -= back;
        restored += back;
      }
    }
    if (restored) changes.push(`Восстановлено костей хитов: ${restored}`);

    if (doc.combat.exhaustion > 0) {
      changes.push(`Истощение: ${doc.combat.exhaustion} → ${doc.combat.exhaustion - 1}`);
      doc.combat.exhaustion -= 1;
    }
  }
  // GM grants that last until a rest, or for a number of days.
  changes.push(...expireOnRest(doc, kind));
  return changes;
}

export function counterResetValue(calc: Calculator, c: Counter): number | null {
  if (c.resetTo === "min") return c.min;
  const max = calc.maxOf(c.max);
  return max.value;
}
