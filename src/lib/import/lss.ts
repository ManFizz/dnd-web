import { ABILITIES, SKILLS, SKILL_IDS, proficiencyForLevel, type Ability, type SkillId } from "@/lib/rules/constants";
import { CONDITIONS } from "@/lib/rules/conditions";
import { Calculator } from "@/lib/rules/compute";
import { newCounter, newEffect, newFeature, newItem, newAttack } from "@/lib/rules/defaults";
import { newId } from "@/lib/rules/ids";
import { docToText, emptyDoc, trimDoc, type RichDoc, type RichMark, type RichNode } from "@/lib/rules/richtext";
import { parseCharacterDoc, type CharacterDoc, type Effect, type Feature, type ProfLevel } from "@/lib/rules/schema";
import { computeSlots, findClassPreset } from "@/lib/rules/tables";

// Importer for character exports from Long Story Short (longstoryshort.app).
// The export is a JSON object whose `data` field holds the sheet as a JSON
// string. Rich text blocks are ProseMirror documents.

export type LssImportResult = {
  doc: CharacterDoc;
  warnings: string[];
  summary: string[];
};

const IMPORT_REASON = "Импорт из Long Story Short";

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
/** LSS stores most fields as { value } objects. */
const val = (v: unknown): unknown => (isObj(v) && "value" in v ? v.value : v);

export function parseLssExport(input: string | unknown): { outer: Json; sheet: Json } {
  const outer = typeof input === "string" ? (JSON.parse(input) as unknown) : input;
  if (!isObj(outer)) throw new Error("Файл не похож на экспорт Long Story Short");
  let sheet: unknown = outer.data;
  if (typeof sheet === "string") sheet = JSON.parse(sheet);
  if (!isObj(sheet) && isObj(outer) && "stats" in outer) sheet = outer;
  if (!isObj(sheet) || !isObj(sheet.stats)) throw new Error("В файле нет данных персонажа");
  return { outer, sheet };
}

// ------------------------------------------------------------- rich text

const SAFE_MARKS = new Set(["bold", "italic", "underline", "strike", "code", "link"]);

function convertMarks(marks: unknown): RichMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: RichMark[] = [];
  for (const m of marks) {
    if (!isObj(m) || typeof m.type !== "string" || !SAFE_MARKS.has(m.type)) continue;
    if (m.type === "link") {
      const href = isObj(m.attrs) ? str(m.attrs.href) : "";
      if (!/^https?:\/\//i.test(href)) continue;
      out.push({ type: "link", attrs: { href, target: "_blank" } });
    } else out.push({ type: m.type });
  }
  return out.length ? out : undefined;
}

function convertInline(node: Json): RichNode[] {
  switch (node.type) {
    case "text": {
      const text = str(node.text);
      if (!text) return [];
      const marks = convertMarks(node.marks);
      return [marks ? { type: "text", text, marks } : { type: "text", text }];
    }
    case "dynamicValue": {
      const expr = isObj(node.attrs) ? str(node.attrs.id) : "";
      return expr ? [{ type: "formula", attrs: { expr, label: "" } }] : [];
    }
    case "formula": {
      const attrs = isObj(node.attrs) ? node.attrs : {};
      const expr = str(attrs.formula) || str(attrs.expr);
      return expr ? [{ type: "formula", attrs: { expr, label: str(attrs.label) } }] : [];
    }
    case "hardBreak":
      return [{ type: "hardBreak" }];
    default: {
      const children = Array.isArray(node.content) ? (node.content as Json[]) : [];
      return children.flatMap((c) => (isObj(c) ? convertInline(c) : []));
    }
  }
}

function convertBlock(node: Json): RichNode[] {
  const children = Array.isArray(node.content) ? (node.content as unknown[]).filter(isObj) : [];
  switch (node.type) {
    case "paragraph": {
      const content = children.flatMap(convertInline);
      return [content.length ? { type: "paragraph", content } : { type: "paragraph" }];
    }
    case "divider":
    case "heading": {
      const content = children.flatMap(convertInline);
      if (!content.length) return [{ type: "horizontalRule" }];
      return [{ type: "heading", attrs: { level: 3 }, content }];
    }
    case "bulletList":
    case "orderedList":
      return [{ type: node.type, content: children.flatMap(convertBlock).filter((c) => c.type === "listItem") }];
    case "listItem": {
      const inner = children.flatMap(convertBlock);
      return [{ type: "listItem", content: inner.length ? inner : [{ type: "paragraph" }] }];
    }
    case "blockquote":
      return [{ type: "blockquote", content: children.flatMap(convertBlock) }];
    case "horizontalRule":
      return [{ type: "horizontalRule" }];
    case "codeBlock":
      return [{ type: "codeBlock", content: children.flatMap(convertInline).filter((c) => c.type === "text").map((c) => ({ type: "text", text: c.text })) }];
    default: {
      const inline = convertInline(node);
      return inline.length ? [{ type: "paragraph", content: inline }] : [];
    }
  }
}

export function convertLssDoc(raw: unknown): RichDoc {
  // Text blocks look like { value: { data: { type: "doc", content: [...] } } }.
  let doc: unknown = raw;
  if (isObj(doc) && "value" in doc) doc = doc.value;
  if (isObj(doc) && "data" in doc) doc = doc.data;
  if (typeof doc === "string") {
    return doc.trim() ? { type: "doc", content: doc.split("\n").map((l) => ({ type: "paragraph", content: l ? [{ type: "text", text: l }] : undefined })) } : emptyDoc();
  }
  if (!isObj(doc) || !Array.isArray(doc.content)) return emptyDoc();
  const content = (doc.content as unknown[]).filter(isObj).flatMap(convertBlock);
  return trimDoc({ type: "doc", content });
}

const paragraphsOf = (doc: RichDoc) => (doc.content ?? []).map((n) => ({ node: n, text: docToText(n).trim() }));

/**
 * Split a document into named sections. Section boundaries are headings
 * (LSS dividers) and short ALL-CAPS paragraphs, which people use as titles.
 */
export function splitSections(doc: RichDoc): { title: string; level: number; source: string; doc: RichDoc }[] {
  const out: { title: string; level: number; source: string; doc: RichDoc }[] = [];
  let current: { title: string; level: number; source: string; nodes: RichNode[] } | null = null;
  const flush = () => {
    if (!current) return;
    const d = trimDoc({ type: "doc", content: current.nodes });
    if (current.title || docToText(d).trim() || JSON.stringify(d).includes('"formula"'))
      out.push({ title: current.title, level: current.level, source: current.source, doc: d });
  };
  for (const n of doc.content ?? []) {
    const text = docToText(n).trim();
    const isCapsTitle =
      n.type === "paragraph" && text.length >= 3 && text.length <= 60 && /\p{Lu}/u.test(text) && text === text.toUpperCase() && !/\d{2,}/.test(text);
    if (n.type === "heading" || isCapsTitle) {
      flush();
      current = { title: isCapsTitle ? capitalize(text) : text, level: 0, source: "", nodes: [] };
      continue;
    }
    if (!current) current = { title: "", level: 0, source: "", nodes: [] };
    // "2-й уровень, умение школы Воплощения" right after a title.
    const lvl = /^(\d{1,2})-?(?:й|ый|ой)?\s+уровень/i.exec(text);
    if (lvl && current.nodes.length === 0 && current.title) {
      current.level = Number(lvl[1]);
      current.source = text;
      continue;
    }
    current.nodes.push(n);
  }
  flush();
  return out;
}

function capitalize(s: string): string {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// --------------------------------------------------------------- targets

const SKILL_BY_LSS: Record<string, SkillId> = {};
for (const id of SKILL_IDS) {
  SKILL_BY_LSS[id.toLowerCase()] = id;
  SKILL_BY_LSS[SKILLS[id].en.toLowerCase()] = id;
  SKILL_BY_LSS[SKILLS[id].en.toLowerCase().replace(/\s+/g, "")] = id;
  SKILL_BY_LSS[SKILLS[id].en.toLowerCase().replace(/\s+/g, "-")] = id;
  SKILL_BY_LSS[SKILLS[id].en.toLowerCase().replace(/\s+/g, "_")] = id;
}

const isAbility = (s: string): s is Ability => (ABILITIES as readonly string[]).includes(s);

/** Map an LSS bonus target to our stat key. Returns null when unknown. */
export function mapLssTarget(target: string): string | null {
  const t = target.trim().toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^stats?\.(\w{3})\.(score|value)$/.exec(t)) && isAbility(m[1])) return `ability.${m[1]}.score`;
  if ((m = /^stats?\.(\w{3})\.(save|saving)$/.exec(t)) && isAbility(m[1])) return `save.${m[1]}`;
  if ((m = /^saves?\.(\w{3})$/.exec(t)) && isAbility(m[1])) return `save.${m[1]}`;
  if ((m = /^stats?\.(\w{3})\.(mod|check)$/.exec(t)) && isAbility(m[1])) return `ability.${m[1]}.check`;
  if ((m = /^skills?\.([\w\s-]+?)\.passive$/.exec(t)) && SKILL_BY_LSS[m[1]]) return `passive.${SKILL_BY_LSS[m[1]]}`;
  if ((m = /^passive\.([\w\s-]+)$/.exec(t)) && SKILL_BY_LSS[m[1]]) return `passive.${SKILL_BY_LSS[m[1]]}`;
  if ((m = /^skills?\.([\w\s-]+)$/.exec(t)) && SKILL_BY_LSS[m[1]]) return `skill.${SKILL_BY_LSS[m[1]]}`;
  const flat = t.replace(/[\s_.-]/g, "");
  const simple: Record<string, string> = {
    ac: "ac",
    armorclass: "ac",
    initiative: "initiative",
    speed: "speed.walk",
    spelldc: "spell.dc",
    spellsave: "spell.dc",
    spellattack: "spell.attack",
    spellmod: "spell.attack",
    proficiency: "prof",
    prof: "prof",
    hpmax: "hp.max",
    hp: "hp.max",
    maxhp: "hp.max",
    darkvision: "sense.darkvision",
    savesall: "save.all",
    allsaves: "save.all",
    checksall: "check.all",
  };
  return simple[flat] ?? null;
}

function lssProf(v: unknown): ProfLevel {
  if (v === true) return 1;
  const n = num(v, 0);
  if (n >= 2) return 2;
  if (n >= 1) return 1;
  if (n > 0) return 0.5;
  return 0;
}

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");

// ----------------------------------------------------------------- import

export function importLss(input: string | unknown): LssImportResult {
  const { outer, sheet } = parseLssExport(input);
  const warnings: string[] = [];
  const summary: string[] = [];
  const info = isObj(sheet.info) ? sheet.info : {};
  const sub = isObj(sheet.subInfo) ? sheet.subInfo : {};
  const vitality = isObj(sheet.vitality) ? sheet.vitality : {};
  const text = isObj(sheet.text) ? sheet.text : {};

  const doc = parseCharacterDoc({});
  doc.name = str(val(sheet.name)) || "Персонаж из LSS";
  doc.meta.importedFrom = "lss";
  doc.meta.importedAt = new Date().toISOString();
  doc.meta.createdAt = str(sheet.createdAt);
  const edition = str(outer.sheetEdition) || str(outer.edition);
  if (edition === "2024") doc.settings.edition = "2024";

  // Basic info ------------------------------------------------------------
  doc.info.race = str(val(info.race));
  doc.info.background = str(val(info.background));
  doc.info.alignment = str(val(info.alignment));
  doc.info.playerName = str(val(info.playerName));
  doc.info.xp = Math.max(0, Math.floor(num(val(info.experience))));
  const size = str(val(info.size));
  if (["tiny", "small", "medium", "large", "huge", "gargantuan"].includes(size)) doc.info.size = size as CharacterDoc["info"]["size"];
  for (const key of ["age", "height", "weight", "eyes", "skin", "hair"] as const) doc.info[key] = str(val(sub[key]));

  const className = str(val(info.charClass));
  const level = Math.min(20, Math.max(1, Math.floor(num(val(info.level), 1))));
  const hitDieMatch = /d(\d+)/i.exec(str(val(vitality["hit-die"])));
  const lssHitDie = hitDieMatch ? Number(hitDieMatch[1]) : null;
  const parts = splitLssClasses(className, str(val(info.charSubclass)), level);
  doc.classes = parts.map((part) => {
    const p = findClassPreset(part.name);
    return {
      id: newId("cl"),
      name: part.name || "Класс",
      preset: p?.id ?? "",
      subclass: part.subclass,
      level: part.level,
      // LSS stores one hit die; with several classes each class keeps its own.
      hitDie: (parts.length === 1 ? lssHitDie : null) ?? p?.hitDie ?? lssHitDie ?? 8,
      caster: p ? (doc.settings.edition === "2024" && p.caster2024 ? p.caster2024 : p.caster) : "none",
      spellAbility: p?.spellAbility ?? "",
    };
  });
  for (const c of doc.classes) {
    if (!c.preset && c.name !== "Класс") warnings.push(`Класс «${c.name}» не распознан: укажите тип заклинателя в настройках класса.`);
  }
  if (parts.length > 1) {
    summary.push(`Мультикласс: ${parts.map((c) => `${c.name} ${c.level}`).join(" / ")}`);
    const total = parts.reduce((a, c) => a + c.level, 0);
    if (total !== level) warnings.push(`Сумма уровней классов (${total}) не совпадает с уровнем в LSS (${level}). Проверьте вкладку «Класс».`);
  } else if (/[/+]/.test(className)) {
    warnings.push(`«${className}» похоже на мультикласс без уровней: разделите классы во вкладке «Класс».`);
  }
  // The class that casts spells: its ability is what LSS calls the spellcasting base.
  const castingClass = doc.classes.find((c) => c.caster !== "none") ?? doc.classes[0];

  // Abilities, saves, skills ----------------------------------------------
  const stats = isObj(sheet.stats) ? sheet.stats : {};
  for (const a of ABILITIES) {
    const s = stats[a];
    const score = Math.round(num(isObj(s) ? s.score : s, 10));
    doc.abilities[a].base = Math.min(30, Math.max(1, score));
  }
  const saves = isObj(sheet.saves) ? sheet.saves : {};
  for (const a of ABILITIES) {
    const s = saves[a];
    if (isObj(s)) doc.saves[a].prof = lssProf(s.isProf);
  }
  const skills = isObj(sheet.skills) ? sheet.skills : {};
  for (const [name, raw] of Object.entries(skills)) {
    const id = SKILL_BY_LSS[name.toLowerCase()] ?? SKILL_BY_LSS[name.toLowerCase().replace(/\s+/g, "")];
    if (!id || !isObj(raw)) continue;
    doc.skills[id].prof = lssProf(raw.isProf);
    const baseStat = str(raw.baseStat);
    if (isAbility(baseStat) && baseStat !== SKILLS[id].ability) doc.skills[id].ability = baseStat;
    if (raw.customPassive !== null && raw.customPassive !== undefined && raw.customPassive !== "") {
      const v = num(raw.customPassive, NaN);
      if (Number.isFinite(v)) doc.overrides[`passive.${id}`] = { value: v, reason: IMPORT_REASON, at: doc.meta.importedAt };
    }
  }

  // Bonuses ----------------------------------------------------------------
  const lssBonuses = Array.isArray(sheet.bonuses) ? sheet.bonuses.filter(isObj) : [];
  const unknownBonuses: string[] = [];
  for (const b of lssBonuses) {
    const target = mapLssTarget(str(b.target));
    const label = str(b.label).trim() || IMPORT_REASON;
    const expr = str(b.expr).trim() || "0";
    if (!target) {
      unknownBonuses.push(`${label}: ${str(b.target)} ${expr}`);
      continue;
    }
    doc.bonuses.push(newEffect({ target, op: "add", value: expr, label, enabled: b.disabled !== true }));
  }
  for (const [key, raw] of [
    ["bonusesStats", sheet.bonusesStats],
    ["bonusesSkills", sheet.bonusesSkills],
  ] as const) {
    if (!isObj(raw)) continue;
    for (const [name, v] of Object.entries(raw)) {
      const n = num(val(v), NaN);
      if (!Number.isFinite(n) || n === 0) continue;
      const target = key === "bonusesStats" ? (isAbility(name) ? `ability.${name}.score` : null) : SKILL_BY_LSS[name.toLowerCase()] ? `skill.${SKILL_BY_LSS[name.toLowerCase()]}` : null;
      if (target) doc.bonuses.push(newEffect({ target, value: String(n), label: IMPORT_REASON }));
      else unknownBonuses.push(`${name}: ${n}`);
    }
  }
  if (unknownBonuses.length) {
    warnings.push(`Не распознано бонусов: ${unknownBonuses.length}. Они сохранены в заметке «Из LSS: нераспознанные бонусы».`);
    doc.notes.push({
      id: newId("nt"),
      title: "Из LSS: нераспознанные бонусы",
      content: { type: "doc", content: unknownBonuses.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })) },
    });
  }
  summary.push(`Бонусов с подписями: ${doc.bonuses.length}`);

  // Vitality -----------------------------------------------------------------
  doc.combat.hpCurrent = Math.round(num(val(vitality["hp-current"]), 10));
  doc.combat.hpTemp = Math.max(0, Math.round(num(val(vitality["hp-temp"]), 0)));
  const hpMax = num(val(vitality["hp-max"]), NaN);
  if (Number.isFinite(hpMax) && hpMax > 0) {
    doc.combat.hpMaxMode = "manual";
    doc.combat.hpMaxManual = Math.round(hpMax);
    doc.combat.hpMaxReason = IMPORT_REASON;
  }
  const diceLeft = num(val(vitality["hp-dice-current"]), NaN);
  if (Number.isFinite(diceLeft)) {
    let used = Math.max(0, doc.classes.reduce((a, c) => a + c.level, 0) - Math.floor(diceLeft));
    // LSS counts dice without types: spend the biggest dice first.
    for (const c of [...doc.classes].sort((a, b) => b.hitDie - a.hitDie)) {
      const key = String(c.hitDie);
      const take = Math.min(used, c.level - (doc.combat.hitDiceUsed[key] ?? 0));
      if (take > 0) doc.combat.hitDiceUsed[key] = (doc.combat.hitDiceUsed[key] ?? 0) + take;
      used -= Math.max(0, take);
    }
  }
  const acRaw = num(val(vitality.ac), NaN);
  if (Number.isFinite(acRaw)) {
    // LSS does not add Dexterity automatically: keep the stored base so the totals match.
    doc.combat.acMode = "manual";
    doc.combat.acManual = Math.round(acRaw);
    doc.combat.acReason = IMPORT_REASON;
  }
  const speed = num(val(vitality.speed), NaN);
  if (Number.isFinite(speed)) doc.combat.speed.walk = Math.round(speed);
  const darkvision = num(val(vitality.darkvision), 0);
  if (darkvision > 0) doc.bonuses.push(newEffect({ target: "sense.darkvision", op: "set", value: String(darkvision), label: IMPORT_REASON }));
  doc.combat.deathFailures = Math.min(3, Math.max(0, Math.floor(num(vitality.deathFails, 0))));
  doc.combat.deathSuccesses = Math.min(3, Math.max(0, Math.floor(num(vitality.deathSuccesses, 0))));
  const shield = vitality.shield;
  if (isObj(shield) && shield.value === true) {
    doc.items.push(newItem({ name: "Щит", category: "shield", equipped: true, shieldBonus: 2 }));
  }

  const lssProfBonus = num(sheet.proficiency, NaN);
  if (Number.isFinite(lssProfBonus) && lssProfBonus !== proficiencyForLevel(level)) {
    doc.overrides.prof = { value: lssProfBonus, reason: IMPORT_REASON, at: doc.meta.importedAt };
  }

  doc.combat.inspiration = sheet.inspiration === true ? 1 : Math.max(0, Math.floor(num(sheet.inspiration, 0)));
  doc.combat.exhaustion = Math.min(10, Math.max(0, Math.floor(num(sheet.exhaustion, 0))));
  if (Array.isArray(sheet.conditions)) {
    for (const c of sheet.conditions) {
      const name = normalizeName(str(isObj(c) ? (c.name ?? c.id ?? c.value) : c));
      const def = CONDITIONS.find((d) => d.id === name || normalizeName(d.label) === name);
      if (def) doc.combat.conditions.push(def.id);
      else if (name) warnings.push(`Состояние «${name}» не распознано.`);
    }
  }

  // Coins --------------------------------------------------------------------
  const coins = isObj(sheet.coins) ? sheet.coins : {};
  for (const c of ["cp", "sp", "ep", "gp", "pp"] as const) doc.coins[c] = Math.max(0, num(val(coins[c]), 0));

  // Proficiencies --------------------------------------------------------------
  const profFlags = isObj(sheet.prof) ? sheet.prof : {};
  const flagNames: Record<string, ["armor" | "weapons", string]> = {
    "armor-light": ["armor", "Лёгкие доспехи"],
    "armor-medium": ["armor", "Средние доспехи"],
    "armor-heavy": ["armor", "Тяжёлые доспехи"],
    "armor-shield": ["armor", "Щиты"],
    shield: ["armor", "Щиты"],
    "weapon-simple": ["weapons", "Простое оружие"],
    "weapon-martial": ["weapons", "Воинское оружие"],
  };
  for (const [key, flag] of Object.entries(profFlags)) {
    const on = val(flag) === true;
    const mapped = flagNames[key];
    if (on && mapped) doc.proficiencies[mapped[0]].push({ id: newId("pf"), name: mapped[1], source: IMPORT_REASON });
  }
  if (text.prof) {
    const profDoc = convertLssDoc(text.prof);
    const leftovers: RichNode[] = [];
    for (const section of splitSections(profDoc)) {
      const title = section.title.toLowerCase();
      const kind = /язык/.test(title)
        ? "languages"
        : /инструм/.test(title)
          ? "tools"
          : /оруж/.test(title)
            ? "weapons"
            : /доспех/.test(title)
              ? "armor"
              : null;
      if (!kind) {
        if (section.title) leftovers.push({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: section.title }] });
        leftovers.push(...(section.doc.content ?? []));
        continue;
      }
      const names = docToText(section.doc)
        .split(/[,;\n•]+/)
        .map((s) => s.trim().replace(/[.]+$/, "").trim())
        .filter((s) => s.length > 0 && s.length < 150);
      for (const name of names) {
        const cap = name.charAt(0).toUpperCase() + name.slice(1);
        if (!doc.proficiencies[kind].some((p) => normalizeName(p.name) === normalizeName(cap)))
          doc.proficiencies[kind].push({ id: newId("pf"), name: cap, source: IMPORT_REASON });
      }
    }
    if (leftovers.length) doc.proficiencies.notes = trimDoc({ type: "doc", content: leftovers });
  }

  // Inventory: link labelled bonuses to equipment lines --------------------------
  const equipmentDoc = text.equipment ? convertLssDoc(text.equipment) : emptyDoc();
  doc.inventoryNotes = equipmentDoc;
  const lines = paragraphsOf(equipmentDoc);
  const takeBonuses = (label: string): Effect[] => {
    const key = normalizeName(label);
    const taken = doc.bonuses.filter((b) => normalizeName(b.label) === key);
    doc.bonuses = doc.bonuses.filter((b) => normalizeName(b.label) !== key);
    return taken;
  };
  const labels = [...new Set(doc.bonuses.map((b) => b.label))].filter((l) => l && l !== IMPORT_REASON);
  for (const label of labels) {
    const key = normalizeName(label);
    const line = lines.find((l) => {
      const t = normalizeName(l.text);
      return t === key || (t.startsWith(key) && /^[\s:(,.—-]/.test(t.slice(key.length)));
    });
    if (!line) continue;
    const effects = takeBonuses(label).map((e) => ({ ...e, label: "" }));
    doc.items.push(
      newItem({
        name: label,
        category: "magic",
        equipped: true,
        description: line.text !== label ? { type: "doc", content: [line.node] } : emptyDoc(),
        effects,
      }),
    );
    summary.push(`Предмет «${label}» создан с бонусами: ${effects.length}`);
  }

  // Feats: labelled bonuses that match a line in personality / feats text.
  const featSources = [text.feats, text.personality].filter(Boolean).map(convertLssDoc);
  const featLines = featSources.flatMap(paragraphsOf);
  for (const label of [...new Set(doc.bonuses.map((b) => b.label))]) {
    if (!label || label === IMPORT_REASON) continue;
    const key = normalizeName(label);
    if (!featLines.some((l) => normalizeName(l.text) === key)) continue;
    const effects = takeBonuses(label).map((e) => ({ ...e, label: "" }));
    doc.features.push(newFeature({ kind: "feat", name: label, source: IMPORT_REASON, effects }));
    summary.push(`Черта «${label}» создана с бонусами: ${effects.length}`);
  }

  // Attunement list and weapons.
  if (Array.isArray(sheet.attunementsList)) {
    for (const a of sheet.attunementsList.filter(isObj)) {
      const name = str(a.value).trim();
      if (!name) continue;
      const existing = doc.items.find((i) => normalizeName(i.name) === normalizeName(name));
      if (existing) {
        existing.attunement = true;
        existing.attuned = a.checked === true;
      } else doc.items.push(newItem({ name, category: "magic", attunement: true, attuned: a.checked === true, equipped: a.checked === true }));
    }
  }
  if (Array.isArray(sheet.weaponsList)) {
    for (const w of sheet.weaponsList.filter(isObj)) {
      const name = str(val(w.name)) || str(w.title);
      if (!name) continue;
      const bonus = str(val(w.mod)) || str(val(w.bonus)) || str(val(w.attack));
      const damage = str(val(w.dmg)) || str(val(w.damage));
      doc.attacks.push(
        newAttack({
          name,
          ability: "none",
          proficient: false,
          bonus: bonus.replace(/[^\d+\-−]/g, ""),
          damage: (/^[\dкдdD+\-−\s]+/.exec(damage)?.[0] ?? "").trim(),
          addMod: false,
          damageType: damage.replace(/^[\dкдdD+\-−\s]+/, "").trim(),
          notes: str(val(w.notes)),
        }),
      );
    }
  }

  // Resources -> counters.
  if (isObj(sheet.resources)) {
    for (const [key, r] of Object.entries(sheet.resources)) {
      if (!isObj(r)) continue;
      const name = str(r.name) || str(r.label) || str(r.title) || key;
      const value = num(r.current ?? r.value ?? r.count, 0);
      const max = r.max ?? r.total;
      doc.counters.push(newCounter({ name, value, max: max === undefined || max === null ? "" : str(max) }));
    }
  }

  // Text blocks ------------------------------------------------------------------
  const feature = (kind: Feature["kind"], section: { title: string; level: number; source: string; doc: RichDoc }, fallback: string) =>
    newFeature({
      kind: kind === "other" && section.level > 0 ? "class" : kind,
      name: section.title || fallback,
      source: section.source || IMPORT_REASON,
      level: section.level,
      description: section.doc,
    });
  if (text.features) {
    for (const section of splitSections(convertLssDoc(text.features))) doc.features.push(feature("other", section, "Умения и способности"));
  }
  if (text.feats) {
    for (const section of splitSections(convertLssDoc(text.feats))) doc.features.push(feature("feat", section, "Черты"));
  }
  const loreMap: [string, keyof CharacterDoc["lore"]][] = [
    ["personality", "personality"],
    ["traits", "ideals"],
    ["ideals", "ideals"],
    ["bonds", "bonds"],
    ["flaws", "flaws"],
    ["appearance", "appearance"],
    ["quests", "quests"],
    ["backstory", "backstory"],
    ["allies", "allies"],
  ];
  for (const [from, to] of loreMap) if (text[from]) doc.lore[to] = convertLssDoc(text[from]);

  const treasure = text.items ? convertLssDoc(text.items) : null;
  if (treasure && docToText(treasure).trim()) doc.notes.push({ id: newId("nt"), title: "Сокровища", content: treasure });
  const attacksText = text.attacks ? convertLssDoc(text.attacks) : null;
  if (attacksText && docToText(attacksText).trim()) doc.notes.push({ id: newId("nt"), title: "Атаки и заклинания", content: attacksText });
  const noteKeys = Object.keys(text)
    .filter((k) => /^notes-\d+$/.test(k))
    .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
  for (const key of noteKeys) {
    const content = convertLssDoc(text[key]);
    if (!docToText(content).trim()) continue;
    doc.notes.push({ id: newId("nt"), title: `Заметки ${key.split("-")[1]}`, content });
  }
  const spellNotes: RichNode[] = [];
  for (const key of Object.keys(text).filter((k) => /^spells-level-\d$/.test(k)).sort()) {
    const content = convertLssDoc(text[key]);
    if (!docToText(content).trim()) continue;
    const lvl = Number(key.slice(-1));
    spellNotes.push({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: lvl === 0 ? "Заговоры" : `${lvl} уровень` }] });
    spellNotes.push(...(content.content ?? []));
  }
  if (spellNotes.length) doc.spellcasting.notes = { type: "doc", content: spellNotes };

  // Spellcasting -------------------------------------------------------------------
  const spellsInfo = isObj(sheet.spellsInfo) ? sheet.spellsInfo : {};
  const baseCode = isObj(spellsInfo.base) ? str(spellsInfo.base.code) : "";
  if (isAbility(baseCode)) {
    const presetAbility = castingClass.spellAbility;
    doc.spellcasting.ability = baseCode === presetAbility ? "auto" : baseCode;
    if (!castingClass.spellAbility) castingClass.spellAbility = baseCode;
  }
  for (const [field, key] of [
    ["save", "spell.dc"],
    ["mod", "spell.attack"],
  ] as const) {
    const f = spellsInfo[field];
    const custom = isObj(f) ? f.customModifier : null;
    if (custom !== null && custom !== undefined && custom !== "") {
      const v = num(custom, NaN);
      if (Number.isFinite(v)) doc.overrides[key] = { value: v, reason: IMPORT_REASON, at: doc.meta.importedAt };
    }
  }
  const slotsRaw = isObj(sheet.spells) ? sheet.spells : {};
  const lssSlots = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let lvl = 1; lvl <= 9; lvl++) {
    const s = slotsRaw[`slots-${lvl}`];
    if (!isObj(s)) continue;
    lssSlots[lvl] = Math.max(0, Math.floor(num(s.value, 0)));
    doc.spellcasting.slotsUsed[lvl] = Math.max(0, Math.floor(num(s.filled, 0)));
  }
  const auto = computeSlots(doc.classes);
  const anySlots = lssSlots.some((x) => x > 0);
  if (anySlots && lssSlots.some((x, i) => i > 0 && x !== auto[i])) {
    doc.spellcasting.slotsMode = "manual";
    doc.spellcasting.manualSlots = lssSlots;
    summary.push("Ячейки заклинаний перенесены вручную (отличаются от таблицы класса)");
  }
  const pactRaw = isObj(sheet.spellsPact) ? sheet.spellsPact : {};
  doc.spellcasting.pactUsed = Math.max(
    0,
    ...Object.values(pactRaw)
      .filter(isObj)
      .map((s) => Math.floor(num(s.filled, 0))),
  );

  const spellRefs = isObj(outer.spells) ? outer.spells : {};
  const ids = new Map<string, { prepared: boolean; inBook: boolean; granted: boolean }>();
  const mark = (id: unknown, flag: "prepared" | "inBook" | "granted") => {
    const key = str(isObj(id) ? id.id : id);
    if (!key) return;
    const entry = ids.get(key) ?? { prepared: false, inBook: false, granted: false };
    entry[flag] = true;
    ids.set(key, entry);
  };
  if (Array.isArray(spellRefs.prepared)) spellRefs.prepared.forEach((id) => mark(id, "prepared"));
  if (Array.isArray(spellRefs.book)) spellRefs.book.forEach((id) => mark(id, "inBook"));
  if (Array.isArray(spellRefs.granted)) spellRefs.granted.forEach((id) => mark(id, "granted"));
  const available = isObj(spellsInfo.available) && Array.isArray(spellsInfo.available.spells) ? spellsInfo.available.spells : [];
  available.forEach((id) => mark(id, "granted"));
  doc.meta.unresolvedSpells = [...ids.entries()].map(([lssId, flags]) => ({ lssId, ...flags }));
  if (ids.size) {
    summary.push(`Заклинаний из LSS: ${ids.size} (их нужно сопоставить с библиотекой)`);
  }

  // Avatar.
  const avatar = isObj(sheet.avatar) ? str(sheet.avatar.webp) || str(sheet.avatar.jpeg) : str(sheet.avatar);
  if (/^https:\/\//.test(avatar)) doc.avatarUrl = avatar;

  // Sanity check: evaluate every imported formula once.
  const calc = new Calculator(doc);
  for (const e of [...doc.bonuses, ...doc.items.flatMap((i) => i.effects), ...doc.features.flatMap((f) => f.effects)]) {
    const r = calc.evaluate(e.value || "0");
    if (!r.ok) warnings.push(`Формула «${e.value}» (${e.label || e.target}): ${r.error}`);
  }

  return { doc: parseCharacterDoc(doc), warnings, summary };
}

/**
 * LSS keeps all classes in one text field. Multiclass characters usually write
 * it as "Воин 5 / Волшебник 3"; when every part has a level, each becomes a class.
 */
export function splitLssClasses(text: string, subclass: string, level: number): { name: string; level: number; subclass: string }[] {
  const parts = text
    .split(/\s*[/+,;|]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const subs = subclass
    .split(/\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const re = /^(.*?[^\s(])[\s(]*(\d{1,2})\s*(?:-?(?:й|ый|ур\.?|уровень|уровня|lvl\.?|lv\.?))?\)?$/i;
  if (parts.length > 1) {
    const matched = parts.map((p) => re.exec(p));
    if (matched.every((m) => m !== null)) {
      const list = matched.map((m, i) => ({
        name: m![1].trim(),
        level: Number(m![2]),
        subclass: subs.length === parts.length ? subs[i] : i === 0 ? subclass.trim() : "",
      }));
      const total = list.reduce((a, c) => a + c.level, 0);
      if (list.every((c) => c.level >= 1 && c.level <= 20) && total <= 20) return list;
    }
  }
  // "Волшебник 13" with the same level as the sheet: drop the number from the name.
  const single = re.exec(text.trim());
  if (parts.length === 1 && single && Number(single[2]) === level) return [{ name: single[1].trim(), level, subclass: subclass.trim() }];
  return [{ name: text.trim(), level, subclass: subclass.trim() }];
}
