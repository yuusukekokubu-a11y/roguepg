// 企画書から取り出したデータ（generated/*.json）を、ゲームで使う形に整える。

import jobsJson from './generated/jobs.json';
import archetypesJson from './generated/archetypes.json';
import booksJson from './generated/books.json';
import accessoriesJson from './generated/accessories.json';
import itemsJson from './generated/items.json';
import floorsJson from './generated/floors.json';
import { parseAction, parseCost, parseTarget } from '../engine/parser';
import type { Condition, Cost, Effect, Stat, TargetKind } from '../engine/types';
import { ACCESSORY_MODS, type AccessoryMod } from './accessoryMods';
import { EXTRA_BOOKS } from './jobTraits';
import type { Lineage } from './equipment';

export type Grade = '◎' | '○' | '△' | '×';

export interface JobDef {
  name: string;
  lineage: Lineage;
  role: string;
  grades: Record<Stat, Grade>;
  comment: string;
  /** 後列からでも近接の威力が落ちない（弓を使う職業） */
  ranged: boolean;
  icon: string;
}

export interface SkillDef {
  name: string;
  job: string;
  lineage: Lineage;
  archetype: string;
  rare: boolean;
  target: TargetKind;
  cost: Cost;
  text: string;
  effects: Effect[];
  conditions: Condition[];
}

export interface AccessoryDef {
  name: string;
  category: string;
  rare: boolean;
  text: string;
  drawback: string;
  synergy: string;
  mod: AccessoryMod;
}

export interface ItemDef {
  name: string;
  category: string;
  rare: boolean;
  target: TargetKind;
  text: string;
  priceRank: string;
  effects: Effect[];
}

const JOB_ICON: Record<string, string> = {
  戦士: '⚔️',
  騎士: '🛡️',
  暗黒騎士: '🗡️',
  侍: '🎌',
  白魔道士: '🤍',
  黒魔道士: '🔥',
  赤魔道士: '🎩',
  呪術師: '💀',
  盗賊: '🥷',
  狩人: '🏹',
  錬金術師: '⚗️',
  吟遊詩人: '🎵',
  踊り子: '💃',
  召喚士: '🔮',
};

export const JOBS: JobDef[] = jobsJson.map((j) => ({
  name: j.name,
  lineage: j.lineage as Lineage,
  role: j.role,
  grades: { hp: j.hp, mp: j.mp, atk: j.atk, def: j.def, mag: j.mag, spr: j.spr, spd: j.spd } as Record<Stat, Grade>,
  comment: j.comment,
  ranged: j.name === '狩人',
  icon: JOB_ICON[j.name] ?? '❔',
}));
export const JOB_BY_NAME = new Map(JOBS.map((j) => [j.name, j]));

export const ARCHETYPES = archetypesJson.map((a) => ({ job: a.job, name: a.name, description: a.description }));

export const SKILLS: SkillDef[] = [...booksJson, ...EXTRA_BOOKS].map((b) => {
  const parsed = parseAction(b.effect);
  return {
    name: b.name,
    job: b.job,
    lineage: b.lineage as Lineage,
    archetype: b.archetype,
    rare: b.rarity === 'レア',
    target: parseTarget(b.target),
    cost: parseCost(b.cost),
    text: b.effect,
    effects: parsed.effects,
    conditions: parsed.conditions,
  };
});
export const SKILL_BY_NAME = new Map(SKILLS.map((s) => [s.name, s]));

export const ACCESSORIES: AccessoryDef[] = accessoriesJson.map((a) => {
  const mod = ACCESSORY_MODS[a.name];
  if (!mod) throw new Error(`アクセサリー「${a.name}」の効果が未定義です（src/data/accessoryMods.ts）`);
  return {
    name: a.name,
    category: a.category,
    rare: a.rarity === 'レア',
    text: a.effect,
    drawback: a.drawback,
    synergy: a.synergy,
    mod,
  };
});
export const ACCESSORY_BY_NAME = new Map(ACCESSORIES.map((a) => [a.name, a]));

export const ITEMS: ItemDef[] = itemsJson.map((i) => ({
  name: i.name,
  category: i.category,
  rare: i.rarity === 'レア',
  target: parseTarget(i.target),
  text: i.effect,
  priceRank: i.price,
  effects: parseAction(i.effect).effects,
}));
export const ITEM_BY_NAME = new Map(ITEMS.map((i) => [i.name, i]));

export const FLOORS = floorsJson;
