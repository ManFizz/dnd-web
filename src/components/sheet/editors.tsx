"use client";

import { Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { BODY_PARTS, REST_LABELS, REST_KINDS } from "@/lib/rules/constants";
import { featureKindLabel } from "@/lib/rules/compute";
import { newEffect } from "@/lib/rules/defaults";
import { ARMOR_TYPE_LABELS, FEATURE_KIND_OPTIONS, ITEM_CATEGORY_LABELS, RARITY_LABELS } from "@/lib/rules/labels";
import type { Armor, Attack, Counter, Effect, Feature, GrantMark, Item, Uses, Weapon } from "@/lib/rules/schema";
import { ITEM_CATEGORIES, RARITIES } from "@/lib/rules/schema";
import { RichEditor } from "@/components/rich/editor";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NumberInput, Select, Switch, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { ReadOnlyContext, useReadOnly } from "@/components/ui/read-only";
import { ATTACK_ABILITY_OPTIONS, AttackEditor, AttacksEditor, DamageTypesDatalist } from "./attacks";
import { EffectRow, EffectsEditor, effectSummary, FormulaPreview } from "./effects";
import { makeEvent, useChange, useDoc } from "./store";

const REST_OPTIONS = REST_KINDS.map((k) => ({ value: k, label: REST_LABELS[k] }));

/** Close guard: asks before throwing away edits. */
function useGuardedClose<T>(initial: T, current: T, onClose: () => void) {
  const ask = useAsk();
  return async () => {
    if (JSON.stringify(initial) !== JSON.stringify(current)) {
      const ok = await ask.confirm({ title: "Закрыть без сохранения?", description: "Изменения в этом окне пропадут.", confirmLabel: "Закрыть", danger: true });
      if (!ok) return;
    }
    onClose();
  };
}

function UsesEditor({ uses, onChange, title = "Ограниченные использования" }: { uses: Uses | null; onChange: (u: Uses | null) => void; title?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <Switch checked={!!uses} onCheckedChange={(on) => onChange(on ? { max: "1", used: 0, reset: "long" } : null)} label={title} />
      {uses && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Максимум" hint={<FormulaPreview formula={uses.max} />}>
            <Input value={uses.max} onChange={(e) => onChange({ ...uses, max: e.target.value })} placeholder="3, PROF, INT" className="font-mono" />
          </Field>
          <Field label="Потрачено">
            <NumberInput value={uses.used} min={0} onCommit={(used) => onChange({ ...uses, used })} />
          </Field>
          <Field label="Восстановление">
            <Select value={uses.reset} onChange={(e) => onChange({ ...uses, reset: e.target.value as Uses["reset"] })} options={REST_OPTIONS} />
          </Field>
        </div>
      )}
    </div>
  );
}

/**
 * What the player may do with an entry the GM granted. The GM's library
 * (onSubmit mode) and the GM's read-only view are not limited by it.
 */
function useGrantRules(grant: GrantMark | null, library: boolean) {
  const gmView = useReadOnly();
  if (library || gmView || !grant) return { canEdit: true, canRemove: true, masked: false, inputsLocked: gmView, notice: null as React.ReactNode };
  const masked = grant.visibility !== "visible";
  const canEdit = grant.lock === "none" && !masked;
  const canRemove = grant.lock !== "noremove";
  const notice = (
    <div className="mb-3 flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
      <Lock className="mt-0.5 size-4 shrink-0" />
      <div>
        Выдано ГМом{grant.reason ? `: ${grant.reason}` : ""}.{!canEdit && " Менять нельзя."}
        {!canRemove && " Убрать нельзя."}
        {grant.removal && <div className="text-muted">Как избавиться: {grant.removal}</div>}
      </div>
    </div>
  );
  return { canEdit, canRemove, masked, inputsLocked: !canEdit, notice };
}

// ------------------------------------------------------------------ features

export function FeatureDialog({
  initial,
  isNew,
  onClose,
  onSubmit,
}: {
  initial: Feature;
  isNew: boolean;
  onClose: () => void;
  /** Library mode: hand the result back instead of changing the sheet. */
  onSubmit?: (next: Feature) => void;
}) {
  const [f, setF] = useState(initial);
  const [tab, setTab] = useState<"main" | "text" | "effects" | "attacks">("main");
  const change = useChange();
  const ask = useAsk();
  const close = useGuardedClose(initial, f, onClose);
  const set = <K extends keyof Feature>(k: K, v: Feature[K]) => setF((x) => ({ ...x, [k]: v }));
  const kindLabel = featureKindLabel(f.kind);
  const isMutation = f.kind === "mutation";
  const rules = useGrantRules(initial.grant, !!onSubmit);

  const save = () => {
    const name = f.name.trim() || "Без названия";
    const next = { ...f, name };
    if (onSubmit) {
      onSubmit(next);
      return;
    }
    change(
      (d) => {
        const idx = d.features.findIndex((x) => x.id === next.id);
        if (idx >= 0) d.features[idx] = next;
        else d.features.push(next);
      },
      makeEvent("feature", `${isNew ? "Добавлено" : "Изменено"}: ${kindLabel.toLowerCase()} «${name}»`, isNew ? next.origin || next.source : "", {
        id: next.id,
      }),
    );
    onClose();
  };

  const remove = async () => {
    const ok = await ask.confirm({
      title: `Удалить «${f.name || "без названия"}»?`,
      description: "Все её бонусы перестанут действовать.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    change(
      (d) => {
        d.features = d.features.filter((x) => x.id !== f.id);
      },
      makeEvent("feature", `Удалено: ${kindLabel.toLowerCase()} «${f.name}»`),
    );
    onClose();
  };

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && close()}
      title={isNew ? `Новая ${isMutation ? "мутация" : "особенность"}` : f.name || "Особенность"}
      description={isMutation ? "Мутация работает как предмет: бонусы, атаки и описание. Её можно отключить, не удаляя." : undefined}
      footer={
        <>
          {!isNew && !onSubmit && rules.canRemove && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              <Trash2 /> Удалить
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            {rules.canEdit ? "Отмена" : "Закрыть"}
          </Button>
          {rules.canEdit && (
            <Button variant="primary" onClick={save}>
              Сохранить
            </Button>
          )}
        </>
      }
    >
      {rules.notice}
      {rules.masked ? (
        <p className="text-sm text-muted">Свойства скрыты ГМом: «???». Они действуют, но узнать их можно только в игре.</p>
      ) : (
        <ReadOnlyContext value={rules.inputsLocked}>
          <div className="mb-4 overflow-x-auto">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "main", label: "Основное" },
                { value: "text", label: "Описание" },
                { value: "effects", label: `Эффекты${f.effects.length ? ` · ${f.effects.length}` : ""}` },
                { value: "attacks", label: `Атаки${f.attacks.length ? ` · ${f.attacks.length}` : ""}` },
              ]}
            />
          </div>
          {tab === "main" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название" className="sm:col-span-2">
                <Input
                  autoFocus={isNew}
                  value={f.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={isMutation ? "Ноги сатира" : "Тёмное зрение"}
                />
              </Field>
              <Field label="Вид">
                <Select value={f.kind} onChange={(e) => set("kind", e.target.value as Feature["kind"])} options={FEATURE_KIND_OPTIONS} />
              </Field>
              <Field label="Источник" hint="Класс и уровень, книга, решение мастера">
                <Input value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="Волшебник, 2 уровень" />
              </Field>
              {isMutation && (
                <>
                  <Field label="Часть тела">
                    <Select
                      value={f.bodyPart || "other"}
                      onChange={(e) => set("bodyPart", e.target.value)}
                      options={BODY_PARTS.map((p) => ({ value: p.id, label: p.label }))}
                    />
                  </Field>
                  <Field label="Откуда" hint="От какой расы или существа">
                    <Input value={f.origin} onChange={(e) => set("origin", e.target.value)} placeholder="Сатир, укус оборотня…" />
                  </Field>
                </>
              )}
              {(f.kind === "class" || f.kind === "race") && (
                <Field label="Уровень получения">
                  <NumberInput value={f.level} min={0} max={30} onCommit={(v) => set("level", v)} />
                </Field>
              )}
              <Field label="Метки" hint="Через запятую" className={f.kind === "class" || f.kind === "race" ? "" : "sm:col-span-2"}>
                <Input
                  value={f.tags.join(", ")}
                  onChange={(e) =>
                    set(
                      "tags",
                      e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="бой, социальное"
                />
              </Field>
              <div className="sm:col-span-2">
                <Switch checked={f.active} onCheckedChange={(v) => set("active", v)} label="Действует (выключите, чтобы временно отключить бонусы)" />
              </div>
              <div className="sm:col-span-2">
                <UsesEditor uses={f.uses} onChange={(u) => set("uses", u)} />
              </div>
            </div>
          )}
          {tab === "text" && <RichEditor value={f.description} onChange={(doc) => set("description", doc)} minHeight="14rem" autoFocus />}
          {tab === "effects" && (
            <EffectsEditor
              effects={f.effects}
              onChange={(effects) => set("effects", effects)}
              emptyText="Эффекты применяются автоматически, пока особенность действует: +2 к Ловкости, скорость полёта 30, сопротивление яду…"
            />
          )}
          {tab === "attacks" && <AttacksEditor attacks={f.attacks} onChange={(a) => set("attacks", a)} />}
        </ReadOnlyContext>
      )}
    </Modal>
  );
}

// --------------------------------------------------------------------- items

const DEFAULT_ARMOR: Armor = { type: "light", base: 11, dexCap: null, stealthDisadvantage: false, strength: 0 };
const DEFAULT_WEAPON: Weapon = {
  ability: "str",
  damage: "1d6",
  damageType: "",
  versatile: "",
  range: "",
  properties: [],
  proficient: true,
  attackBonus: "",
  damageBonus: "",
};

function ArmorEditor({ armor, onChange }: { armor: Armor; onChange: (a: Armor) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Тип доспеха">
        <Select
          value={armor.type}
          onChange={(e) => {
            const type = e.target.value as Armor["type"];
            onChange({ ...armor, type, dexCap: type === "medium" ? 2 : type === "heavy" ? 0 : null });
          }}
          options={Object.entries(ARMOR_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </Field>
      <Field label="Базовый КД">
        <NumberInput value={armor.base} min={0} max={40} onCommit={(base) => onChange({ ...armor, base })} />
      </Field>
      <Field label="Макс. бонус ЛОВ" hint="Пусто — без ограничения">
        <Input
          value={armor.dexCap === null ? "" : String(armor.dexCap)}
          inputMode="numeric"
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange({ ...armor, dexCap: v === "" ? null : Math.max(0, Math.min(10, Number(v) || 0)) });
          }}
          disabled={armor.type === "heavy"}
        />
      </Field>
      <Field label="Требуемая Сила">
        <NumberInput value={armor.strength} min={0} max={30} onCommit={(strength) => onChange({ ...armor, strength })} />
      </Field>
      <div className="flex items-end pb-2 sm:col-span-2">
        <Checkbox
          checked={armor.stealthDisadvantage}
          onChange={(e) => onChange({ ...armor, stealthDisadvantage: e.target.checked })}
          label="Помеха на Скрытность"
        />
      </div>
    </div>
  );
}

function WeaponEditor({ weapon, onChange }: { weapon: Weapon; onChange: (w: Weapon) => void }) {
  const set = <K extends keyof Weapon>(k: K, v: Weapon[K]) => onChange({ ...weapon, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Характеристика атаки">
        <Select value={weapon.ability} onChange={(e) => set("ability", e.target.value as Weapon["ability"])} options={ATTACK_ABILITY_OPTIONS} />
      </Field>
      <Field label="Урон" hint={<FormulaPreview formula={weapon.damage} />}>
        <Input value={weapon.damage} onChange={(e) => set("damage", e.target.value)} className="font-mono" placeholder="1d8" />
      </Field>
      <Field label="Тип урона">
        <Input value={weapon.damageType} onChange={(e) => set("damageType", e.target.value)} list="damage-types" placeholder="Рубящий" />
      </Field>
      <Field label="Универсальное">
        <Input value={weapon.versatile} onChange={(e) => set("versatile", e.target.value)} className="font-mono" placeholder="1d10" />
      </Field>
      <Field label="Дистанция">
        <Input value={weapon.range} onChange={(e) => set("range", e.target.value)} placeholder="80/320 фт." />
      </Field>
      <Field label="Свойства" hint="Через запятую">
        <Input
          value={weapon.properties.join(", ")}
          onChange={(e) =>
            set(
              "properties",
              e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            )
          }
          placeholder="Фехтовальное, лёгкое"
        />
      </Field>
      <Field label="Бонус атаки (магия)" hint={<FormulaPreview formula={weapon.attackBonus} />}>
        <Input value={weapon.attackBonus} onChange={(e) => set("attackBonus", e.target.value)} className="font-mono" placeholder="1" />
      </Field>
      <Field label="Бонус урона" hint={<FormulaPreview formula={weapon.damageBonus} />}>
        <Input value={weapon.damageBonus} onChange={(e) => set("damageBonus", e.target.value)} className="font-mono" placeholder="1" />
      </Field>
      <Checkbox checked={weapon.proficient} onChange={(e) => set("proficient", e.target.checked)} label="Владею этим оружием" />
      <DamageTypesDatalist />
    </div>
  );
}

export function ItemDialog({
  initial,
  isNew,
  onClose,
  onSubmit,
}: {
  initial: Item;
  isNew: boolean;
  onClose: () => void;
  /** Library mode: hand the result back instead of changing the sheet. */
  onSubmit?: (next: Item) => void;
}) {
  const [item, setItem] = useState(initial);
  const [tab, setTab] = useState<"main" | "text" | "effects" | "attacks">("main");
  const change = useChange();
  const ask = useAsk();
  const close = useGuardedClose(initial, item, onClose);
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setItem((x) => ({ ...x, [k]: v }));
  const rules = useGrantRules(initial.grant, !!onSubmit);

  const setCategory = (category: Item["category"]) =>
    setItem((x) => ({
      ...x,
      category,
      armor: category === "armor" ? (x.armor ?? DEFAULT_ARMOR) : x.armor,
      weapon: category === "weapon" ? (x.weapon ?? DEFAULT_WEAPON) : x.weapon,
    }));

  const save = () => {
    const name = item.name.trim() || "Предмет";
    const next: Item = {
      ...item,
      name,
      armor: item.category === "armor" ? item.armor : null,
      weapon: item.category === "weapon" ? item.weapon : null,
      attuned: item.attunement ? item.attuned : false,
    };
    if (onSubmit) {
      onSubmit(next);
      return;
    }
    change(
      (d) => {
        const idx = d.items.findIndex((x) => x.id === next.id);
        if (idx >= 0) d.items[idx] = next;
        else d.items.push(next);
      },
      makeEvent(
        "item",
        isNew ? `Получен предмет «${name}»${next.quantity !== 1 ? ` ×${next.quantity}` : ""}` : `Изменён предмет «${name}»`,
        isNew ? next.origin : "",
        {
          id: next.id,
        },
      ),
    );
    onClose();
  };

  const remove = async () => {
    const reason = await ask.text({
      title: `Убрать «${item.name || "предмет"}»?`,
      label: "Куда делся (необязательно)",
      placeholder: "Продан, потерян, сломан…",
      confirmLabel: "Убрать",
      reasonSuggestions: true,
    });
    if (reason === null) return;
    change(
      (d) => {
        d.items = d.items.filter((x) => x.id !== item.id);
      },
      makeEvent("item", `Убран предмет «${item.name}»`, reason),
    );
    onClose();
  };

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && close()}
      title={isNew ? "Новый предмет" : item.name || "Предмет"}
      footer={
        <>
          {!isNew && !onSubmit && rules.canRemove && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              <Trash2 /> Убрать
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            {rules.canEdit ? "Отмена" : "Закрыть"}
          </Button>
          {rules.canEdit && (
            <Button variant="primary" onClick={save}>
              Сохранить
            </Button>
          )}
        </>
      }
    >
      {rules.notice}
      {rules.masked ? (
        <p className="text-sm text-muted">Свойства предмета скрыты ГМом: «???». Узнать их можно в игре, например заклинанием «Опознание».</p>
      ) : (
        <ReadOnlyContext value={rules.inputsLocked}>
          <div className="mb-4 overflow-x-auto">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "main", label: "Основное" },
                { value: "text", label: "Описание" },
                { value: "effects", label: `Эффекты${item.effects.length ? ` · ${item.effects.length}` : ""}` },
                { value: "attacks", label: `Атаки${item.attacks.length ? ` · ${item.attacks.length}` : ""}` },
              ]}
            />
          </div>
          {tab === "main" && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Название" className="sm:col-span-2">
                  <Input autoFocus={isNew} value={item.name} onChange={(e) => set("name", e.target.value)} placeholder="Плащ защиты" />
                </Field>
                <Field label="Тип">
                  <Select
                    value={item.category}
                    onChange={(e) => setCategory(e.target.value as Item["category"])}
                    options={ITEM_CATEGORIES.map((c) => ({ value: c, label: ITEM_CATEGORY_LABELS[c] }))}
                  />
                </Field>
                <Field label="Редкость">
                  <Select
                    value={item.rarity}
                    onChange={(e) => set("rarity", e.target.value as Item["rarity"])}
                    options={RARITIES.map((r) => ({ value: r, label: RARITY_LABELS[r] }))}
                  />
                </Field>
                <Field label="Количество">
                  <NumberInput value={item.quantity} min={0} integer={false} onCommit={(v) => set("quantity", v)} />
                </Field>
                <Field label="Вес (фнт.)">
                  <NumberInput value={item.weight} min={0} integer={false} onCommit={(v) => set("weight", v)} />
                </Field>
                <Field label="Цена">
                  <Input value={item.cost} onChange={(e) => set("cost", e.target.value)} placeholder="50 зм" />
                </Field>
                <Field label="Откуда" hint={isNew ? "Попадёт в журнал" : undefined}>
                  <Input value={item.origin} onChange={(e) => set("origin", e.target.value)} placeholder="Награда, покупка…" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Switch checked={item.equipped} onCheckedChange={(v) => set("equipped", v)} label="Надет / в руках" />
                <Switch
                  checked={item.attunement}
                  onCheckedChange={(v) => setItem((x) => ({ ...x, attunement: v, attuned: v ? x.attuned : false }))}
                  label="Требует настройки"
                />
                {item.attunement && <Switch checked={item.attuned} onCheckedChange={(v) => set("attuned", v)} label="Настроен" />}
              </div>
              {item.category === "armor" && item.armor && (
                <div className="rounded-lg border border-line p-3">
                  <div className="mb-2 text-sm font-semibold">Доспех</div>
                  <ArmorEditor armor={item.armor} onChange={(a) => set("armor", a)} />
                </div>
              )}
              {item.category === "shield" && (
                <Field label="Бонус щита к КД" className="max-w-40">
                  <NumberInput value={item.shieldBonus} min={0} max={20} onCommit={(v) => set("shieldBonus", v)} />
                </Field>
              )}
              {item.category === "weapon" && item.weapon && (
                <div className="rounded-lg border border-line p-3">
                  <div className="mb-2 text-sm font-semibold">Оружие</div>
                  <WeaponEditor weapon={item.weapon} onChange={(w) => set("weapon", w)} />
                </div>
              )}
              <UsesEditor uses={item.charges} onChange={(u) => set("charges", u)} title="Заряды" />
              <Field label="Ссылка" hint="Например, страница предмета на dnd.su">
                <Input value={item.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" />
              </Field>
            </div>
          )}
          {tab === "text" && <RichEditor value={item.description} onChange={(doc) => set("description", doc)} minHeight="14rem" autoFocus />}
          {tab === "effects" && (
            <EffectsEditor
              effects={item.effects}
              onChange={(effects) => set("effects", effects)}
              showWhen
              emptyText="Эффекты предмета применяются автоматически: по умолчанию, когда предмет надет (или настроен, если требует настройки)."
            />
          )}
          {tab === "attacks" && <AttacksEditor attacks={item.attacks} onChange={(a) => set("attacks", a)} />}
        </ReadOnlyContext>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------ bonuses, overrides

export function BonusDialog({ initial, isNew, onClose }: { initial: Effect; isNew: boolean; onClose: () => void }) {
  const [effect, setEffect] = useState(initial);
  const change = useChange();
  const doc = useDoc();
  const close = useGuardedClose(initial, effect, onClose);
  const needsLabel = doc.settings.requireReasons && !effect.label.trim();
  const save = () => {
    change(
      (d) => {
        const idx = d.bonuses.findIndex((b) => b.id === effect.id);
        if (idx >= 0) d.bonuses[idx] = effect;
        else d.bonuses.push(effect);
      },
      makeEvent("bonus", `${isNew ? "Добавлен бонус" : "Изменён бонус"}: ${effectSummary(effect)}`, effect.label, { id: effect.id }),
    );
    onClose();
  };
  const remove = () => {
    change(
      (d) => {
        d.bonuses = d.bonuses.filter((b) => b.id !== effect.id);
      },
      makeEvent("bonus", `Удалён бонус: ${effectSummary(effect)}`, effect.label),
    );
    onClose();
  };
  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && close()}
      title={isNew ? "Новый бонус" : "Бонус"}
      description="Бонус меняет показатель автоматически и показывается в разборе «из чего складывается» со своей подписью."
      footer={
        <>
          {!isNew && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              <Trash2 /> Удалить
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={needsLabel}>
            Сохранить
          </Button>
        </>
      }
    >
      <EffectRow effect={effect} onChange={setEffect} onRemove={remove} requireLabel={doc.settings.requireReasons} />
      {needsLabel && <p className="mt-2 text-xs text-muted">Подпишите, за что получен бонус: например «Благословение жреца», «Дар мастера за 5 сессию».</p>}
    </Modal>
  );
}

export function OverrideDialog({ statKey, title, current, onClose }: { statKey: string; title: string; current: number; onClose: () => void }) {
  const [value, setValue] = useState(current);
  const [reason, setReason] = useState("");
  const change = useChange();
  const save = () => {
    change(
      (d) => {
        d.overrides[statKey] = { value, reason: reason.trim(), at: new Date().toISOString() };
      },
      makeEvent("override", `${title}: вручную ${value} (по расчёту ${current})`, reason.trim(), { key: statKey }),
    );
    onClose();
  };
  return (
    <Modal
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={`Задать вручную: ${title}`}
      description="Ручное значение заменяет расчёт, пока вы его не снимете. Бонусы и предметы перестанут влиять на это число."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={!reason.trim()}>
            Задать
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) save();
        }}
      >
        <Field label="Значение" hint={`Сейчас по расчёту: ${current}`}>
          <NumberInput value={value} onCommit={setValue} autoFocus />
        </Field>
        <Field label="Причина" required hint="Обязательно: попадёт в разбор и журнал">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Решение мастера, проклятие…" />
        </Field>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------- attacks

export function AttackDialog({ initial, isNew, onClose }: { initial: Attack; isNew: boolean; onClose: () => void }) {
  const [attack, setAttack] = useState(initial);
  const change = useChange();
  const close = useGuardedClose(initial, attack, onClose);
  const save = () => {
    change(
      (d) => {
        const idx = d.attacks.findIndex((a) => a.id === attack.id);
        if (idx >= 0) d.attacks[idx] = attack;
        else d.attacks.push(attack);
      },
      makeEvent("edit", `${isNew ? "Добавлена атака" : "Изменена атака"} «${attack.name}»`),
    );
    onClose();
  };
  const remove = () => {
    change(
      (d) => {
        d.attacks = d.attacks.filter((a) => a.id !== attack.id);
      },
      makeEvent("edit", `Удалена атака «${attack.name}»`),
    );
    onClose();
  };
  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && close()}
      title={isNew ? "Новая атака" : attack.name || "Атака"}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              <Trash2 /> Удалить
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save}>
            Сохранить
          </Button>
        </>
      }
    >
      <AttackEditor attack={attack} onChange={setAttack} />
    </Modal>
  );
}

// ------------------------------------------------------------------ counters

export function CounterDialog({
  initial,
  isNew,
  onClose,
  onSubmit,
}: {
  initial: Counter;
  isNew: boolean;
  onClose: () => void;
  /** Library mode: hand the result back instead of changing the sheet. */
  onSubmit?: (next: Counter) => void;
}) {
  const [c, setC] = useState(initial);
  const change = useChange();
  const ask = useAsk();
  const close = useGuardedClose(initial, c, onClose);
  const set = <K extends keyof Counter>(k: K, v: Counter[K]) => setC((x) => ({ ...x, [k]: v }));
  const rules = useGrantRules(initial.grant, !!onSubmit);
  const save = () => {
    const name = c.name.trim() || "Счётчик";
    const next = { ...c, name };
    if (onSubmit) {
      onSubmit(next);
      return;
    }
    change(
      (d) => {
        const idx = d.counters.findIndex((x) => x.id === next.id);
        if (idx >= 0) d.counters[idx] = next;
        else d.counters.push(next);
      },
      makeEvent("counter", isNew ? `Новый счётчик «${name}»: ${next.value}` : `Изменён счётчик «${name}»`),
    );
    onClose();
  };
  const remove = async () => {
    const ok = await ask.confirm({ title: `Удалить счётчик «${c.name}»?`, confirmLabel: "Удалить", danger: true });
    if (!ok) return;
    change(
      (d) => {
        d.counters = d.counters.filter((x) => x.id !== c.id);
      },
      makeEvent("counter", `Удалён счётчик «${c.name}» (было ${c.value})`),
    );
    onClose();
  };
  return (
    <Modal
      open
      size="md"
      onOpenChange={(o) => !o && close()}
      title={isNew ? "Новый счётчик" : c.name || "Счётчик"}
      description="Сухпайки, рубины, стрелы, заряды особенности — что угодно со значением."
      footer={
        <>
          {!isNew && !onSubmit && rules.canRemove && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              <Trash2 /> Удалить
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            {rules.canEdit ? "Отмена" : "Закрыть"}
          </Button>
          {rules.canEdit && (
            <Button variant="primary" onClick={save}>
              Сохранить
            </Button>
          )}
        </>
      }
    >
      {rules.notice}
      <ReadOnlyContext value={rules.inputsLocked}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Название" className="sm:col-span-2" hint="В формулах: @counter.название (пробелы заменяются на _)">
            <Input autoFocus={isNew} value={c.name} onChange={(e) => set("name", e.target.value)} placeholder="Рубины" />
          </Field>
          <Field label={isNew ? "Начальное значение" : "Значение"}>
            <NumberInput value={c.value} integer={false} onCommit={(v) => set("value", v)} />
          </Field>
          <Field label="Максимум" hint={c.max ? <FormulaPreview formula={c.max} /> : "Пусто — без ограничения"}>
            <Input value={c.max} onChange={(e) => set("max", e.target.value)} placeholder="10, PROF, 2*LVL" className="font-mono" />
          </Field>
          <Field label="Минимум">
            <NumberInput value={c.min} integer={false} onCommit={(v) => set("min", v)} />
          </Field>
          <Field label="Шаг кнопок ±">
            <NumberInput value={c.step} min={0} integer={false} onCommit={(v) => set("step", v || 1)} />
          </Field>
          <Field label="Восстановление">
            <Select value={c.reset} onChange={(e) => set("reset", e.target.value as Counter["reset"])} options={REST_OPTIONS} />
          </Field>
          {c.reset !== "none" && (
            <Field label="Сбрасывать к">
              <Select
                value={c.resetTo}
                onChange={(e) => set("resetTo", e.target.value as Counter["resetTo"])}
                options={[
                  { value: "max", label: "Максимуму" },
                  { value: "min", label: "Минимуму" },
                ]}
              />
            </Field>
          )}
          <Field label="Группа" hint="Счётчики одной группы показываются вместе">
            <Input value={c.group} onChange={(e) => set("group", e.target.value)} placeholder="Сокровища" />
          </Field>
          <div className="flex items-end pb-2">
            <Switch checked={c.pinned} onCheckedChange={(v) => set("pinned", v)} label="Показывать во вкладке «Бой»" />
          </div>
          <Field label="Описание" className="sm:col-span-2">
            <Textarea value={c.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </Field>
        </div>
      </ReadOnlyContext>
    </Modal>
  );
}

export const newBonus = (target = "ability.str.score") => newEffect({ target, op: "add", value: "1" });
