// 変異個体：普通の敵が、ときどき性質付きで出てくる。倒すと経験値・お金が1.5倍。
// 効果はアクセサリーと同じ部品（AccessoryMod）で表す。

import type { Stat } from '../engine/types';
import type { AccessoryMod } from './accessoryMods';

export interface VariantDef {
  id: string;
  /** 名前の前に付く言葉 */
  prefix: string;
  text: string;
  stats: Partial<Record<Stat, number>>;
  mod?: AccessoryMod;
  /** 絵の色味を変える（CSS の filter） */
  tint: string;
  /** 絵の大きさの倍率 */
  scale?: number;
}

export const VARIANTS: VariantDef[] = [
  { id: 'fierce', prefix: '狂暴な', text: '攻撃力が高い', stats: { atk: 1.4 }, tint: 'sepia(0.4) saturate(2.2) hue-rotate(-25deg)' },
  { id: 'hard', prefix: '硬化した', text: '防御力とHPが高い', stats: { def: 1.7, hp: 1.2 }, tint: 'grayscale(0.7) brightness(1.15) contrast(1.2)' },
  { id: 'swift', prefix: '俊敏な', text: '素早く、攻撃をかわしやすい', stats: { spd: 1.4 }, mod: { evasionAdd: 0.15 }, tint: 'hue-rotate(170deg) saturate(1.3)' },
  { id: 'regen', prefix: '再生する', text: '自分の番が来るたびにHPが回復する', stats: { hp: 1.1 }, mod: { regenRatio: 0.08 }, tint: 'hue-rotate(80deg) saturate(1.5)' },
  { id: 'venom', prefix: '毒をまとう', text: '物理攻撃に毒がつく。毒が効かない', stats: {}, mod: { physicalStatus: 'poison', immune: ['poison'] }, tint: 'hue-rotate(250deg) saturate(1.8)' },
  { id: 'giant', prefix: '巨大な', text: 'HPと攻撃力が高いが、遅い', stats: { hp: 1.8, atk: 1.2, spd: 0.8 }, tint: 'brightness(0.85) contrast(1.15)', scale: 1.3 },
];

export const VARIANT_BY_ID = new Map(VARIANTS.map((v) => [v.id, v]));

/** 層ごとの、普通の敵が変異個体になる確率 */
export const VARIANT_CHANCE: Record<number, number> = { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.25 };

/** 変異個体の報酬倍率 */
export const VARIANT_REWARD = 1.5;
