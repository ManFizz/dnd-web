import { describe, expect, it } from "vitest";
import { newFeature, newItem } from "../rules/defaults";
import { checkPlayerSave, expireOnRest, expireOnRound, GrantRuleError, insertEntry, instantiate, removeEntry } from "../rules/grant-rules";
import { rebaseDoc } from "../rules/merge";
import { applyRest } from "../rules/rest";
import { GrantMarkSchema, parseCharacterDoc, type CharacterDoc, type Feature, type Item } from "../rules/schema";

const mark = (over: Partial<ReturnType<typeof GrantMarkSchema.parse>> = {}) => GrantMarkSchema.parse({ id: "g1", campaignId: "c1", ...over });
const clone = (d: CharacterDoc) => JSON.parse(JSON.stringify(d)) as CharacterDoc;

function withGrant(over: Parameters<typeof mark>[0] = {}, item: Partial<Item> = {}) {
  const doc = parseCharacterDoc({ name: "Виталя" });
  const entry = instantiate("item", newItem({ name: "Проклятый меч", ...item }), mark(over));
  insertEntry(doc, "item", entry);
  return { doc, entry: entry as Item };
}

describe("grant copies", () => {
  it("gets a fresh id and the mark", () => {
    const body = newItem({ name: "Зелье" });
    const copy = instantiate("item", body, mark(), { quantity: 3 }) as Item;
    expect(copy.id).not.toBe(body.id);
    expect(copy.grant?.id).toBe("g1");
    expect(copy.quantity).toBe(3);
  });

  it("a mutation replaces the one on the same body part", () => {
    const doc = parseCharacterDoc({});
    insertEntry(doc, "feature", newFeature({ kind: "mutation", name: "Ноги сатира", bodyPart: "legs" }));
    const replaced = insertEntry(doc, "feature", instantiate("feature", newFeature({ kind: "mutation", name: "Ноги тролля" }), mark(), { bodyPart: "legs" }));
    expect(replaced.map((r) => r.name)).toEqual(["Ноги сатира"]);
    expect(doc.features.map((f) => f.name)).toEqual(["Ноги тролля"]);
  });

  it("uses the effects of the current stage", () => {
    const stages = [
      { name: "1", effects: [{ id: "e1", target: "ac", op: "add" as const, value: "-1", label: "", enabled: true, when: "auto" as const }] },
      { name: "2", effects: [{ id: "e2", target: "ac", op: "add" as const, value: "-2", label: "", enabled: true, when: "auto" as const }] },
    ];
    const f = instantiate("feature", newFeature({ kind: "curse" }), mark({ stage: 1, stages: 2 }), { stages }) as Feature;
    expect(f.effects[0].value).toBe("-2");
  });

  it("can be removed by grant id", () => {
    const { doc } = withGrant();
    expect(removeEntry(doc, "g1")?.name).toBe("Проклятый меч");
    expect(doc.items).toHaveLength(0);
  });
});

describe("player saves against locks", () => {
  it("allows table state changes on a locked item", () => {
    const { doc } = withGrant({ lock: "noremove" });
    const next = clone(doc);
    next.items[0].equipped = true;
    next.items[0].quantity = 2;
    expect(() => checkPlayerSave(doc, next)).not.toThrow();
  });

  it("blocks edits and removal of locked grants", () => {
    const { doc } = withGrant({ lock: "noremove" });
    const edited = clone(doc);
    edited.items[0].name = "Обычный меч";
    expect(() => checkPlayerSave(doc, edited)).toThrow(GrantRuleError);
    const removed = clone(doc);
    removed.items = [];
    expect(() => checkPlayerSave(doc, removed)).toThrow(/нельзя убрать/);
  });

  it("lets the player drop an unlocked grant and reports it", () => {
    const { doc } = withGrant();
    const next = clone(doc);
    next.items = [];
    expect(checkPlayerSave(doc, next).removed).toEqual(["g1"]);
  });

  it("restores the GM's mark and drops forged ones", () => {
    const { doc } = withGrant({ lock: "noedit" });
    const next = clone(doc);
    next.items[0].grant!.lock = "none";
    next.items.push({ ...newItem({ name: "Подделка" }), grant: mark({ id: "fake" }) });
    checkPlayerSave(doc, next);
    expect(next.items[0].grant?.lock).toBe("noedit");
    expect(next.items[1].grant).toBeNull();
  });

  it("a cursed item cannot be taken off and tells the GM when put on", () => {
    const { doc } = withGrant({ cursed: true }, { attunement: true });
    const on = clone(doc);
    on.items[0].attuned = true;
    expect(checkPlayerSave(doc, on, "Виталя").notices[0]).toMatch(/Виталя настроился на проклятый предмет/);
    const off = clone(on);
    off.items[0].attuned = false;
    expect(() => checkPlayerSave(on, off)).toThrow(/проклят/);
  });
});

describe("grant timers", () => {
  it("ends 'until rest' grants and counts down days", () => {
    const doc = parseCharacterDoc({});
    insertEntry(doc, "item", instantiate("item", newItem({ name: "Благословение" }), mark({ id: "a", expires: "long" })));
    insertEntry(doc, "item", instantiate("item", newItem({ name: "Яд" }), mark({ id: "b", expires: "days", left: 2 })));
    expect(expireOnRest(doc, "short")).toEqual([]);
    applyRest(doc, "long");
    expect(doc.items.map((i) => [i.name, i.grant?.left])).toEqual([["Яд", 1]]);
  });

  it("ends round-based grants", () => {
    const doc = parseCharacterDoc({});
    insertEntry(doc, "feature", instantiate("feature", newFeature({ name: "Ускорение" }), mark({ expires: "rounds", left: 1 })));
    expect(expireOnRound(doc)).toEqual(["Ускорение"]);
    expect(doc.features).toHaveLength(0);
  });
});

describe("rebase after a GM change", () => {
  it("keeps both the GM's grant and the player's unsaved edit", () => {
    const base = parseCharacterDoc({ name: "Виталя", items: [newItem({ id: "it_a", name: "Посох" })] });
    const local = clone(base);
    local.items[0].name = "Посох мага";
    local.combat.hpCurrent = 5;
    const remote = clone(base);
    remote.items.push(newItem({ id: "it_b", name: "Кольцо" }));
    remote.info.xp = 300;
    const merged = rebaseDoc(base, local, remote);
    expect(merged.items.map((i) => i.name)).toEqual(["Посох мага", "Кольцо"]);
    expect(merged.combat.hpCurrent).toBe(5);
    expect(merged.info.xp).toBe(300);
  });

  it("does not resurrect entries deleted on either side", () => {
    const base = parseCharacterDoc({ items: [newItem({ id: "it_a" }), newItem({ id: "it_b" })] });
    const local = clone(base);
    local.items = local.items.filter((i) => i.id !== "it_a");
    const remote = clone(base);
    remote.items = remote.items.filter((i) => i.id !== "it_b");
    expect(rebaseDoc(base, local, remote).items).toEqual([]);
  });
});
