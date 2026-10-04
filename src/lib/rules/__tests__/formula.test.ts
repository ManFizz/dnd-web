import { describe, expect, it } from "vitest";
import { averageValue, evalFormula, formatValue, formulaVariables, rollValue, type FValue } from "../formula";

const vars: Record<string, number> = { dex: 1, int: 6, prof: 5, "@level": 13, "@int.mod": 6 };
const resolve = (name: string) => vars[name.toLowerCase()] ?? vars[name];

function ok(src: string): FValue {
  const r = evalFormula(src, resolve);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("formula", () => {
  it("evaluates plain numbers and LSS style bonuses", () => {
    expect(ok("+2").n).toBe(2);
    expect(ok("-1").n).toBe(-1);
    expect(ok("1").n).toBe(1);
    expect(ok("").n).toBe(0);
    expect(ok("2 + 3 * 4").n).toBe(14);
    expect(ok("(2 + 3) * 4").n).toBe(20);
  });

  it("rounds division down like the rules", () => {
    expect(ok("13 / 2").n).toBe(6);
    expect(ok("@level / 2").n).toBe(6);
  });

  it("resolves variables and functions", () => {
    expect(ok("DEX").n).toBe(1);
    expect(ok("[DEX]").n).toBe(1);
    expect(ok("8 + PROF + INT").n).toBe(19);
    expect(ok("max(1, DEX)").n).toBe(1);
    expect(ok("макс(3, INT)").n).toBe(6);
    expect(ok("floor(@level / 4) + 1").n).toBe(4);
  });

  it("supports dice in latin and cyrillic notation", () => {
    expect(formatValue(ok("1d4+2"))).toBe("1d4+2");
    expect(formatValue(ok("2к10"))).toBe("2d10");
    expect(formatValue(ok("1д8 + DEX"))).toBe("1d8+1");
    expect(formatValue(ok("d20"))).toBe("1d20");
    expect(formatValue(ok("1d6 + 1d6 + 3"))).toBe("2d6+3");
    expect(formatValue(ok("4d6kh3"))).toBe("4d6kh3");
    expect(formatValue(ok("(@level/2)d6"))).toBe("6d6");
    expect(formatValue(ok("2*(1d8+1)"))).toBe("2d8+2");
    expect(formatValue(ok("-1d4"))).toBe("−1d4");
  });

  it("formats signed values", () => {
    expect(formatValue({ n: 5, dice: [] }, { signed: true })).toBe("+5");
    expect(formatValue({ n: -2, dice: [] }, { signed: true })).toBe("−2");
    expect(formatValue({ n: 0, dice: [] }, { signed: true })).toBe("+0");
  });

  it("reports readable errors", () => {
    const r = evalFormula("2 + unknownVar", resolve);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unknownVar");
    expect(evalFormula("(1 + 2", resolve).ok).toBe(false);
    expect(evalFormula("1d6 / 2", resolve).ok).toBe(false);
    expect(evalFormula("5 / 0", resolve).ok).toBe(false);
    expect(evalFormula("1 $ 2", resolve).ok).toBe(false);
  });

  it("rolls dice deterministically with a seeded rng", () => {
    const seq = [0, 0.99, 0.5];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    const r = rollValue(ok("3d6+2"), rng);
    expect(r.dice[0].rolls).toEqual([1, 6, 4]);
    expect(r.total).toBe(13);
  });

  it("keeps highest dice", () => {
    const seq = [0.0, 0.99, 0.5, 0.2];
    let i = 0;
    const r = rollValue(ok("4d6kh3"), () => seq[i++]);
    expect(r.dice[0].rolls).toEqual([1, 6, 4, 2]);
    expect(r.total).toBe(12);
  });

  it("computes averages and variable lists", () => {
    expect(averageValue(ok("2d6+3"))).toBe(10);
    expect(formulaVariables("8 + PROF + @int.mod").sort()).toEqual(["@int.mod", "PROF"]);
  });
});
