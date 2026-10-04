import { describe, expect, it } from "vitest";
import { advance, hpWord, playerView, sortCombatants, CombatantSchema, type EncounterRow } from "../encounter";
import { payCoins, priceInCp } from "../shop";

const purse = (p: Partial<Record<"cp" | "sp" | "ep" | "gp" | "pp", number>>) => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...p });
const value = (p: ReturnType<typeof purse>) => p.cp + p.sp * 10 + p.ep * 50 + p.gp * 100 + p.pp * 1000;

describe("shop payment", () => {
  it("converts prices to copper", () => {
    expect(priceInCp(2, "gp")).toBe(200);
    expect(priceInCp(0.5, "sp")).toBe(5);
  });

  it("pays exactly with small coins first", () => {
    expect(payCoins(purse({ cp: 5, gp: 3 }), 105)).toEqual(purse({ gp: 2 }));
  });

  it("breaks a bigger coin and gives change", () => {
    const next = payCoins(purse({ gp: 1 }), 15)!;
    expect(next).toEqual(purse({ sp: 8, cp: 5 }));
    expect(value(next)).toBe(85);
  });

  it("refuses when money is short", () => {
    expect(payCoins(purse({ sp: 9 }), 95)).toBeNull();
  });

  it("always takes exactly the cost", () => {
    const start = purse({ cp: 3, sp: 7, ep: 1, gp: 4, pp: 1 });
    for (const cost of [1, 9, 49, 77, 333, 1234, value(start)]) {
      const next = payCoins(start, cost)!;
      expect(value(next)).toBe(value(start) - cost);
      expect(Object.values(next).every((n) => n >= 0)).toBe(true);
    }
  });
});

describe("initiative", () => {
  const c = (over: Partial<ReturnType<typeof CombatantSchema.parse>>) => CombatantSchema.parse({ id: over.name ?? "x", kind: "monster", name: "x", ...over });

  it("sorts by initiative, then bonus, unrolled last", () => {
    const list = [
      c({ name: "А", initiative: 12, initBonus: 1 }),
      c({ name: "Б", initiative: null }),
      c({ name: "В", initiative: 12, initBonus: 3 }),
      c({ name: "Г", initiative: 20 }),
    ];
    expect(sortCombatants(list).map((x) => x.name)).toEqual(["Г", "В", "А", "Б"]);
  });

  it("advances turns and rounds", () => {
    expect(advance(0, 0, 3)).toEqual({ round: 1, turn: 0, newRound: true });
    expect(advance(1, 1, 3)).toEqual({ round: 1, turn: 2, newRound: false });
    expect(advance(1, 2, 3)).toEqual({ round: 2, turn: 0, newRound: true });
  });

  it("describes health in words", () => {
    expect(hpWord(10, 10)).toBe("невредим");
    expect(hpWord(8, 10)).toBe("слегка ранен");
    expect(hpWord(5, 10)).toBe("ранен");
    expect(hpWord(2, 10)).toBe("тяжело ранен");
    expect(hpWord(1, 20)).toBe("при смерти");
    expect(hpWord(0, 10)).toBe("повержен");
  });

  it("hides secret monsters and others' numbers from players", () => {
    const e: EncounterRow = {
      id: "e",
      name: "Засада",
      status: "active",
      round: 1,
      turn: 0,
      log: [],
      updatedAt: "",
      combatants: [
        c({ id: "m1", name: "Гоблин", initiative: 18, hp: 3, maxHp: 7, hidden: true }),
        c({ id: "p1", kind: "pc", characterId: "ch1", name: "Виталя", initiative: 15, hp: 40, maxHp: 80 }),
        c({ id: "p2", kind: "pc", characterId: "ch2", name: "Боб", initiative: 10, hp: 30, maxHp: 30 }),
      ],
    };
    const view = playerView(e, ["ch1"]);
    expect(view.current).toBeNull();
    expect(view.combatants.map((x) => x.name)).toEqual(["Виталя", "Боб"]);
    expect(view.combatants[0].health).toBe("40/80");
    expect(view.combatants[1].health).toBe("невредим");
    expect(playerView({ ...e, turn: 1 }, []).current).toBe("p1");
  });
});
