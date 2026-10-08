// パーティーのキャラクター（ラン中ずっと持ち越すデータ）と、ステータス計算。

import { ACCESSORY_BY_NAME, JOB_BY_NAME, type Grade } from '../data';
import { EQUIPMENT } from '../data/equipment';
import type { AccessoryMod } from '../data/accessoryMods';
import { BALANCE } from './balance';
import { STATS, type Stat } from './types';

export interface Character {
  id: string;
  name: string;
  job: string;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  skills: string[];
  weapon: string | null;
  armor: string | null;
  accessories: [string | null, string | null];
  row: 'front' | 'back';
  isHero: boolean;
  /** イベントなどで永久に上がった能力値 */
  bonus?: Partial<Record<Stat, number>>;
}

export type Stats = Record<Stat, number>;

function gradeValue(stat: Stat, grade: Grade, level: number): number {
  const table = stat === 'hp' ? BALANCE.grade.hp : stat === 'mp' ? BALANCE.grade.mp : stat === 'spd' ? BALANCE.grade.spd : BALANCE.grade.other;
  return Math.floor(table.base[grade] + table.growth[grade] * (level - 1));
}

/** 職業とレベルだけで決まる素のステータス */
export function jobStats(job: string, level: number): Stats {
  const def = JOB_BY_NAME.get(job);
  if (!def) throw new Error(`職業「${job}」がありません`);
  return Object.fromEntries(STATS.map((s) => [s, gradeValue(s, def.grades[s], level)])) as Stats;
}

export function accessoryMods(c: Character): AccessoryMod[] {
  return c.accessories.filter((a): a is string => !!a).map((a) => ACCESSORY_BY_NAME.get(a)!.mod);
}

/** 装備・アクセサリー（常に効くもの）込みのステータス。hp/mp は最大値 */
export function characterStats(c: Character): Stats {
  const st = jobStats(c.job, c.level);
  for (const eq of [c.weapon, c.armor]) {
    const def = EQUIPMENT.find((e) => e.name === eq);
    if (!def) continue;
    for (const [k, v] of Object.entries(def.stats)) st[k as Stat] += v;
  }
  for (const [k, v] of Object.entries(c.bonus ?? {})) st[k as Stat] += v;
  for (const mod of accessoryMods(c)) {
    for (const [k, v] of Object.entries(mod.statMul ?? {})) st[k as Stat] = Math.max(1, Math.round(st[k as Stat] * v));
  }
  return st;
}

let nextId = 1;
export function createCharacter(job: string, level: number, isHero: boolean, name?: string): Character {
  const st = jobStats(job, level);
  return {
    id: `c${nextId++}-${Math.floor(Math.random() * 1e6)}`,
    name: name ?? job,
    job,
    level,
    exp: 0,
    hp: st.hp,
    mp: st.mp,
    skills: [],
    weapon: null,
    armor: null,
    accessories: [null, null],
    row: 'front',
    isHero,
  };
}

/** 経験値を足してレベルアップ処理。上がったレベル数を返す */
export function gainExp(c: Character, exp: number): number {
  if (c.hp <= 0) return 0; // 戦闘不能のキャラは経験値をもらえない
  c.exp += exp;
  let ups = 0;
  while (c.level < BALANCE.maxLevel && c.exp >= BALANCE.expToNext(c.level)) {
    c.exp -= BALANCE.expToNext(c.level);
    levelUp(c);
    ups++;
  }
  return ups;
}

export function levelUp(c: Character) {
  const before = characterStats(c);
  c.level++;
  const after = characterStats(c);
  // 増えた最大HP・MPの分だけ、今のHP・MPも増える
  if (c.hp > 0) c.hp += after.hp - before.hp;
  c.mp += after.mp - before.mp;
}

export function clampVitals(c: Character) {
  const st = characterStats(c);
  c.hp = Math.max(0, Math.min(c.hp, st.hp));
  c.mp = Math.max(0, Math.min(c.mp, st.mp));
}

export function skillSlots(c: Character): number {
  return BALANCE.skillSlots(c.level);
}

export function canUseBook(c: Character, bookJob: string): boolean {
  return c.job === bookJob;
}

export function canEquip(c: Character, item: { slot: 'weapon' | 'armor'; lineage: string }): boolean {
  return JOB_BY_NAME.get(c.job)!.lineage === item.lineage;
}
