// A small expression language for bonuses and formulas in text.
//
//   numbers        2, +2, -1, 1.5
//   dice           1d6, d20, 2к10 (Cyrillic "к"/"д" also work), 4d6kh3, 2d20kl1
//   dice by expr   (@level/2)d6
//   variables      DEX, @int.mod, PROF, LVL, @spell.dc ... (resolved by the caller)
//   operators      + - * / (division rounds down, as in the rules)
//   functions      floor ceil round min max abs clamp (мин макс окр вниз вверх)

export class FormulaError extends Error {
  constructor(
    message: string,
    public pos = -1,
  ) {
    super(message);
    this.name = "FormulaError";
  }
}

export type Keep = { mode: "h" | "l"; n: number };
export type DiceTerm = { count: number; sides: number; sign: 1 | -1; keep?: Keep };
/** Result of an evaluation: a constant plus an optional list of dice terms. */
export type FValue = { n: number; dice: DiceTerm[] };

type Token =
  | { t: "num"; v: number; pos: number }
  | { t: "dice"; count: number; sides: number; keep?: Keep; pos: number }
  | { t: "dop"; sides: number; keep?: Keep; pos: number }
  | { t: "id"; v: string; pos: number }
  | { t: "op"; v: "+" | "-" | "*" | "/"; pos: number }
  | { t: "("; pos: number }
  | { t: ")"; pos: number }
  | { t: ","; pos: number };

export type FNode =
  | { k: "num"; v: number }
  | { k: "dice"; count: FNode | null; sides: number; keep?: Keep }
  | { k: "var"; name: string; pos: number }
  | { k: "call"; name: string; args: FNode[]; pos: number }
  | { k: "neg"; e: FNode }
  | { k: "bin"; op: "+" | "-" | "*" | "/"; a: FNode; b: FNode };

const DICE_LETTERS = new Set(["d", "D", "к", "К", "д", "Д"]);
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isIdStart = (c: string | undefined) => c !== undefined && /[A-Za-zА-Яа-яЁё_@]/.test(c);
const isIdChar = (c: string | undefined) => c !== undefined && /[A-Za-zА-Яа-яЁё0-9_.]/.test(c);

function normalizeSource(src: string): string {
  return src.replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/");
}

function tokenize(input: string): Token[] {
  const src = normalizeSource(input);
  const tokens: Token[] = [];
  let i = 0;

  const readInt = () => {
    const start = i;
    while (isDigit(src[i])) i++;
    return Number(src.slice(start, i));
  };

  const readDiceTail = (pos: number): { sides: number; keep?: Keep } => {
    // src[i] is the dice letter
    i++;
    let sides: number;
    if (src[i] === "%") {
      i++;
      sides = 100;
    } else if (isDigit(src[i])) {
      sides = readInt();
    } else {
      throw new FormulaError("После «d» должно идти число граней", pos);
    }
    let keep: Keep | undefined;
    const rest = src.slice(i).toLowerCase();
    const m = /^(kh|kl|k)(\d+)/.exec(rest);
    if (m) {
      keep = { mode: m[1] === "kl" ? "l" : "h", n: Number(m[2]) };
      i += m[0].length;
    }
    if (sides < 1) throw new FormulaError("У кости должна быть хотя бы одна грань", pos);
    return { sides, keep };
  };

  const prevEndsValue = () => {
    const p = tokens[tokens.length - 1];
    return p !== undefined && (p.t === "num" || p.t === "id" || p.t === ")" || p.t === "dice" || p.t === "dop");
  };

  while (i < src.length) {
    const c = src[i];
    const pos = i;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      const start = i;
      while (isDigit(src[i])) i++;
      if (src[i] === "." && isDigit(src[i + 1])) {
        i++;
        while (isDigit(src[i])) i++;
      }
      const text = src.slice(start, i);
      if (DICE_LETTERS.has(src[i]) && (isDigit(src[i + 1]) || src[i + 1] === "%")) {
        if (text.includes(".")) throw new FormulaError("Количество костей должно быть целым", pos);
        const tail = readDiceTail(pos);
        tokens.push({ t: "dice", count: Number(text), sides: tail.sides, keep: tail.keep, pos });
      } else {
        tokens.push({ t: "num", v: Number(text), pos });
      }
      continue;
    }
    if (DICE_LETTERS.has(c) && (isDigit(src[i + 1]) || src[i + 1] === "%")) {
      const last = tokens[tokens.length - 1];
      const tail = readDiceTail(pos);
      if (last?.t === ")") tokens.push({ t: "dop", sides: tail.sides, keep: tail.keep, pos });
      else if (prevEndsValue()) throw new FormulaError("Неожиданная кость", pos);
      else tokens.push({ t: "dice", count: 1, sides: tail.sides, keep: tail.keep, pos });
      continue;
    }
    if (isIdStart(c)) {
      const start = i;
      i++;
      while (isIdChar(src[i])) i++;
      let name = src.slice(start, i);
      // Trailing dots are not part of identifiers ("DEX." at the end of a sentence).
      while (name.endsWith(".")) {
        name = name.slice(0, -1);
        i--;
      }
      tokens.push({ t: "id", v: name, pos });
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ t: "op", v: c, pos });
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      tokens.push({ t: c, pos } as Token);
      i++;
      continue;
    }
    if (c === "[" || c === "]" || c === "{" || c === "}") {
      // Brackets are tolerated as decoration: [DEX] works like DEX.
      i++;
      continue;
    }
    throw new FormulaError(`Непонятный символ «${c}»`, pos);
  }
  return tokens;
}

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}

  parse(): FNode {
    if (this.tokens.length === 0) return { k: "num", v: 0 };
    const node = this.expr();
    const extra = this.tokens[this.i];
    if (extra) throw new FormulaError("Лишние символы в формуле", extra.pos);
    return node;
  }

  private peek() {
    return this.tokens[this.i];
  }

  private expr(): FNode {
    let left = this.term();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && (t.v === "+" || t.v === "-")) {
        this.i++;
        left = { k: "bin", op: t.v, a: left, b: this.term() };
      } else return left;
    }
  }

  private term(): FNode {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && (t.v === "*" || t.v === "/")) {
        this.i++;
        left = { k: "bin", op: t.v, a: left, b: this.unary() };
      } else return left;
    }
  }

  private unary(): FNode {
    const t = this.peek();
    if (t?.t === "op" && (t.v === "+" || t.v === "-")) {
      this.i++;
      const e = this.unary();
      return t.v === "-" ? { k: "neg", e } : e;
    }
    return this.postfix();
  }

  private postfix(): FNode {
    let node = this.primary();
    for (;;) {
      const t = this.peek();
      if (t?.t === "dop") {
        this.i++;
        node = { k: "dice", count: node, sides: t.sides, keep: t.keep };
      } else return node;
    }
  }

  private primary(): FNode {
    const t = this.peek();
    if (!t) throw new FormulaError("Формула оборвалась", -1);
    this.i++;
    switch (t.t) {
      case "num":
        return { k: "num", v: t.v };
      case "dice":
        return { k: "dice", count: { k: "num", v: t.count }, sides: t.sides, keep: t.keep };
      case "id": {
        if (this.peek()?.t === "(") {
          this.i++;
          const args: FNode[] = [];
          if (this.peek()?.t !== ")") {
            for (;;) {
              args.push(this.expr());
              const sep = this.peek();
              if (sep?.t === ",") {
                this.i++;
                continue;
              }
              break;
            }
          }
          const close = this.peek();
          if (close?.t !== ")") throw new FormulaError("Не хватает закрывающей скобки", close?.pos ?? -1);
          this.i++;
          return { k: "call", name: t.v, args, pos: t.pos };
        }
        return { k: "var", name: t.v, pos: t.pos };
      }
      case "(": {
        const e = this.expr();
        const close = this.peek();
        if (close?.t !== ")") throw new FormulaError("Не хватает закрывающей скобки", close?.pos ?? -1);
        this.i++;
        return e;
      }
      default:
        throw new FormulaError("Ожидалось число, кость или переменная", t.pos);
    }
  }
}

const parseCache = new Map<string, FNode | FormulaError>();

export function parseFormula(src: string): FNode {
  const cached = parseCache.get(src);
  if (cached instanceof FormulaError) throw cached;
  if (cached) return cached;
  try {
    const node = new Parser(tokenize(src)).parse();
    if (parseCache.size > 5000) parseCache.clear();
    parseCache.set(src, node);
    return node;
  } catch (e) {
    if (e instanceof FormulaError) parseCache.set(src, e);
    throw e;
  }
}

export type Resolver = (name: string) => number | undefined;

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  floor: (a) => Math.floor(a[0]),
  ceil: (a) => Math.ceil(a[0]),
  round: (a) => Math.round(a[0]),
  abs: (a) => Math.abs(a[0]),
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  clamp: (a) => Math.min(Math.max(a[0], a[1]), a[2]),
  вниз: (a) => Math.floor(a[0]),
  вверх: (a) => Math.ceil(a[0]),
  окр: (a) => Math.round(a[0]),
  мин: (a) => Math.min(...a),
  макс: (a) => Math.max(...a),
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

const constant = (n: number): FValue => ({ n, dice: [] });
export const hasDice = (v: FValue) => v.dice.length > 0;

function requireConst(v: FValue, what: string): number {
  if (hasDice(v)) throw new FormulaError(`${what}: здесь нельзя использовать кости`);
  return v.n;
}

export function evaluateNode(node: FNode, resolve: Resolver): FValue {
  switch (node.k) {
    case "num":
      return constant(node.v);
    case "dice": {
      const count = node.count ? requireConst(evaluateNode(node.count, resolve), "Количество костей") : 1;
      if (!Number.isFinite(count) || count < 0) throw new FormulaError("Неверное количество костей");
      const c = Math.floor(count);
      if (c > 1000) throw new FormulaError("Слишком много костей");
      return { n: 0, dice: c === 0 ? [] : [{ count: c, sides: node.sides, sign: 1, keep: node.keep }] };
    }
    case "var": {
      const v = resolve(node.name);
      if (v === undefined || Number.isNaN(v)) throw new FormulaError(`Неизвестная переменная «${node.name}»`, node.pos);
      return constant(v);
    }
    case "call": {
      const fn = FUNCTIONS[node.name.toLowerCase()];
      if (!fn) throw new FormulaError(`Неизвестная функция «${node.name}»`, node.pos);
      const args = node.args.map((a) => requireConst(evaluateNode(a, resolve), node.name));
      if (args.length === 0) throw new FormulaError(`Функции «${node.name}» нужны аргументы`, node.pos);
      return constant(fn(args));
    }
    case "neg": {
      const v = evaluateNode(node.e, resolve);
      return { n: -v.n, dice: v.dice.map((d) => ({ ...d, sign: (d.sign === 1 ? -1 : 1) as 1 | -1 })) };
    }
    case "bin": {
      const a = evaluateNode(node.a, resolve);
      const b = evaluateNode(node.b, resolve);
      switch (node.op) {
        case "+":
          return { n: a.n + b.n, dice: [...a.dice, ...b.dice] };
        case "-":
          return { n: a.n - b.n, dice: [...a.dice, ...b.dice.map((d) => ({ ...d, sign: (d.sign === 1 ? -1 : 1) as 1 | -1 }))] };
        case "*": {
          if (!hasDice(a) && !hasDice(b)) return constant(a.n * b.n);
          const [dv, k] = hasDice(a) ? [a, requireConst(b, "Умножение")] : [b, requireConst(a, "Умножение")];
          if (!Number.isInteger(k) || k < 0) throw new FormulaError("Кости можно умножать только на целое число");
          return { n: dv.n * k, dice: k === 0 ? [] : dv.dice.map((d) => ({ ...d, count: d.count * k })) };
        }
        case "/": {
          const x = requireConst(a, "Деление");
          const y = requireConst(b, "Деление");
          if (y === 0) throw new FormulaError("Деление на ноль");
          return constant(Math.floor(x / y));
        }
      }
    }
  }
}

export type EvalResult = { ok: true; value: FValue } | { ok: false; error: string };

export function evalFormula(src: string, resolve: Resolver): EvalResult {
  try {
    return { ok: true, value: evaluateNode(parseFormula(src), resolve) };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Collect variable names used by a formula (for dependency hints and validation). */
export function formulaVariables(src: string): string[] {
  const names = new Set<string>();
  const walk = (n: FNode) => {
    if (n.k === "var") names.add(n.name);
    else if (n.k === "call") n.args.forEach(walk);
    else if (n.k === "neg") walk(n.e);
    else if (n.k === "bin") {
      walk(n.a);
      walk(n.b);
    } else if (n.k === "dice" && n.count) walk(n.count);
  };
  walk(parseFormula(src));
  return [...names];
}

function mergeDice(dice: DiceTerm[]): DiceTerm[] {
  const out: DiceTerm[] = [];
  for (const d of dice) {
    const same = !d.keep && out.find((o) => !o.keep && o.sides === d.sides && o.sign === d.sign);
    if (same) same.count += d.count;
    else out.push({ ...d });
  }
  return out;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Human readable value: "1d4+6", "+5", "2d6−1". */
export function formatValue(v: FValue, opts: { signed?: boolean } = {}): string {
  const dice = mergeDice(v.dice);
  const parts: string[] = [];
  dice.forEach((d, idx) => {
    const keep = d.keep ? `k${d.keep.mode}${d.keep.n}` : "";
    const body = `${d.count}d${d.sides}${keep}`;
    if (idx === 0) parts.push(d.sign === -1 ? `−${body}` : opts.signed ? `+${body}` : body);
    else parts.push(d.sign === -1 ? `−${body}` : `+${body}`);
  });
  if (v.n !== 0 || dice.length === 0) {
    const abs = formatNumber(Math.abs(v.n));
    if (dice.length === 0) parts.push(v.n < 0 ? `−${abs}` : opts.signed ? `+${abs}` : abs);
    else parts.push(v.n < 0 ? `−${abs}` : `+${abs}`);
  }
  return parts.join("");
}

export type DieRoll = { term: DiceTerm; rolls: number[]; kept: boolean[]; subtotal: number };
export type RollResult = { total: number; dice: DieRoll[]; constant: number; expression: string };

export function rollValue(v: FValue, rng: () => number = Math.random): RollResult {
  const dice: DieRoll[] = mergeDice(v.dice).map((term) => {
    const rolls = Array.from({ length: term.count }, () => 1 + Math.floor(rng() * term.sides));
    let kept = rolls.map(() => true);
    if (term.keep) {
      const order = rolls.map((r, idx) => ({ r, idx })).sort((x, y) => (term.keep!.mode === "h" ? y.r - x.r : x.r - y.r));
      const keepIdx = new Set(order.slice(0, term.keep.n).map((o) => o.idx));
      kept = rolls.map((_, idx) => keepIdx.has(idx));
    }
    const sum = rolls.reduce((acc, r, idx) => acc + (kept[idx] ? r : 0), 0);
    return { term, rolls, kept, subtotal: term.sign * sum };
  });
  const total = dice.reduce((acc, d) => acc + d.subtotal, 0) + v.n;
  return { total, dice, constant: v.n, expression: formatValue(v) };
}

/** Average result (useful for "take average" hit points and previews). */
export function averageValue(v: FValue): number {
  return v.dice.reduce((acc, d) => acc + d.sign * d.count * ((d.sides + 1) / 2), v.n);
}

/** Matches dice notation inside plain text, e.g. "2к6", "1d8 + 3". */
export const DICE_IN_TEXT = /(?<![\p{L}\d])(\d{0,3})[dкд](\d{1,3})(?:\s*([+\-−])\s*(\d{1,3})(?![\p{L}\d]))?(?![\p{L}\d])/giu;
