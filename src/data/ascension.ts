// アセンション（クリアするたびに解放される、一段上の難しさ）。企画書にない追加。
// 段は主人公の職業ごとに記録する。上の段は、下の段の条件をすべて引き継ぐ。

import type { AccessoryMod } from './accessoryMods';

export const MAX_ASCENSION = 10;

/** 段ごとに追加される条件（index 0 が 1段） */
export const ASCENSION_TEXT: string[] = [
  '強敵が強くなる（HP・攻撃+10%）',
  '変異個体が出やすくなる（1.5倍）。倒したときの報酬の上乗せが1.5倍→1.2倍',
  '普通の敵が強くなる（HP・攻撃+8%）',
  '休憩所の回復量が減る（40%→30%）',
  'ボスが強くなる（HP・攻撃+10%）',
  'ショップが値上がりする（+20%）。最初のお金が半分',
  '★レアの本・アクセサリーが出にくくなる',
  'ボスを倒しても全回復しない（半分だけ回復）',
  '強敵のマスが増える',
  '主人公が呪いのアクセサリーを着けて始まる（外せない）',
];

/**
 * 10段で主人公が着けて始まる呪いのアクセサリー（デメリットだけ。戦利品やショップには出ない）
 */
export const CURSES: { name: string; text: string; mod: AccessoryMod }[] = [
  { name: '呪いの鎖', text: '素早さ-25%', mod: { statMul: { spd: 0.75 } } },
  { name: '血吸いの輪', text: '毎ターン最大HPの4%を失う', mod: { hpDrainRatio: 0.04 } },
  { name: '衰えの指輪', text: '攻撃力・魔力-15%', mod: { statMul: { atk: 0.85, mag: 0.85 } } },
  { name: '枯渇の首飾り', text: 'MP消費+40%', mod: { mpCostMul: 1.4 } },
  { name: '脆さの護符', text: '受けるダメージ+15%', mod: { damageTakenMul: 1.15 } },
];
export const CURSE_POOL = CURSES.map((c) => c.name);

export interface AscensionRules {
  eliteScale: number;
  normalScale: number;
  bossScale: number;
  variantMul: number;
  /** 変異個体を倒したときの報酬倍率 */
  variantReward: number;
  /** 休憩所の回復量の倍率 */
  restMul: number;
  priceMul: number;
  startGoldMul: number;
  rareMul: number;
  bossHeal: number;
  eliteWeightMul: number;
  cursed: boolean;
}

/** 段の数字から、実際に効く数値をまとめて出す */
export function ascensionRules(level = 0): AscensionRules {
  const at = (n: number) => level >= n;
  return {
    eliteScale: at(1) ? 1.1 : 1,
    variantMul: at(2) ? 1.5 : 1,
    variantReward: at(2) ? 1.2 : 1.5,
    normalScale: at(3) ? 1.08 : 1,
    restMul: at(4) ? 0.75 : 1,
    bossScale: at(5) ? 1.1 : 1,
    priceMul: at(6) ? 1.2 : 1,
    startGoldMul: at(6) ? 0.5 : 1,
    rareMul: at(7) ? 0.6 : 1,
    bossHeal: at(8) ? 0.5 : 1,
    eliteWeightMul: at(9) ? 1.8 : 1,
    cursed: at(10),
  };
}
