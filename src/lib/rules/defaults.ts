import { newId } from "./ids";
import { emptyDoc } from "./richtext";
import {
  parseCharacterDoc,
  type Attack,
  type CharacterDoc,
  type CharacterDocInput,
  type Counter,
  type Effect,
  type Feature,
  type Item,
} from "./schema";

export function newCharacterDoc(input: CharacterDocInput = {}): CharacterDoc {
  return parseCharacterDoc({
    ...input,
    meta: { createdAt: new Date().toISOString(), ...(input.meta ?? {}) },
  });
}

export function newEffect(partial: Partial<Effect> = {}): Effect {
  return {
    id: newId("ef"),
    target: "ability.str.score",
    op: "add",
    value: "",
    label: "",
    enabled: true,
    when: "auto",
    ...partial,
  };
}

export function newFeature(partial: Partial<Feature> = {}): Feature {
  return {
    id: newId("ft"),
    kind: "other",
    name: "",
    source: "",
    level: 0,
    active: true,
    bodyPart: "",
    origin: "",
    description: emptyDoc(),
    effects: [],
    uses: null,
    attacks: [],
    tags: [],
    ...partial,
  };
}

export function newItem(partial: Partial<Item> = {}): Item {
  return {
    id: newId("it"),
    name: "",
    category: "gear",
    quantity: 1,
    weight: 0,
    cost: "",
    rarity: "",
    equipped: false,
    attunement: false,
    attuned: false,
    description: emptyDoc(),
    effects: [],
    armor: null,
    shieldBonus: 2,
    weapon: null,
    charges: null,
    attacks: [],
    link: "",
    ...partial,
  };
}

export function newAttack(partial: Partial<Attack> = {}): Attack {
  return {
    id: newId("at"),
    name: "",
    kind: "attack",
    ability: "str",
    proficient: true,
    bonus: "",
    damage: "",
    addMod: true,
    damageType: "",
    saveAbility: "",
    saveDc: "",
    range: "",
    activation: "action",
    notes: "",
    ...partial,
  };
}

export function newCounter(partial: Partial<Counter> = {}): Counter {
  return {
    id: newId("ct"),
    name: "",
    value: 0,
    max: "",
    min: 0,
    step: 1,
    reset: "none",
    resetTo: "max",
    group: "",
    color: "",
    pinned: false,
    description: "",
    ...partial,
  };
}
