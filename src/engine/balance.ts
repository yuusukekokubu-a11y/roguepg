// 「試作で調整」とされている数値をここに集めている。
// バランスを変えたいときは基本的にこのファイルだけを触ればよい。

import type { Size } from './types';

export const BALANCE = {
  /** ◎○△× を数値にしたときの Lv1 の値と、1レベルごとの伸び */
  grade: {
    hp: { base: { '◎': 52, '○': 45, '△': 39, '×': 35 }, growth: { '◎': 9, '○': 7, '△': 6, '×': 5 } },
    mp: { base: { '◎': 34, '○': 24, '△': 15, '×': 9 }, growth: { '◎': 4, '○': 3, '△': 2, '×': 1 } },
    other: { base: { '◎': 14, '○': 11, '△': 8, '×': 6 }, growth: { '◎': 2.5, '○': 2, '△': 1.5, '×': 1 } },
    spd: { base: { '◎': 14, '○': 11, '△': 9, '×': 7 }, growth: { '◎': 0.8, '○': 0.6, '△': 0.5, '×': 0.4 } },
  },

  /** 技の威力（通常攻撃＝1.0 に対する倍率） */
  power: { small: 0.8, medium: 1.3, large: 1.9, huge: 3.0 } as Record<Size, number>,
  /** ダメージ計算： 攻撃 × 威力 × K / (K + 防御) */
  defenseK: 20,
  /** 回復量： 精神 × 倍率 + 固定値 */
  heal: {
    small: { mul: 1.0, flat: 6 },
    medium: { mul: 1.8, flat: 12 },
    large: { mul: 3.0, flat: 22 },
    huge: { mul: 4.0, flat: 30 },
  } as Record<Size, { mul: number; flat: number }>,
  /** アイテム（固定値）のダメージ・回復量 */
  fixedDamage: { small: 14, medium: 28, large: 50, huge: 90 } as Record<Size, number>,
  fixedHeal: { small: 30, medium: 70, large: 150, huge: 300 } as Record<Size, number>,
  mpHeal: { small: 10, medium: 20, large: 35, huge: 60 } as Record<Size, number>,

  /** コスト */
  mpCost: { small: 4, medium: 8, large: 14 },
  hpCostRatio: { small: 0.08, medium: 0.15, large: 0.25 },

  /** 乱数のぶれ（±） */
  variance: 0.1,
  critChance: 0.05,
  critMul: 1.6,
  baseEvasion: 0.04,

  /** 隊列：後列からの近接攻撃・後列への近接攻撃は威力ダウン */
  backRowMeleeMul: 0.7,
  /** 敵が前列・後列を狙う重み */
  targetWeight: { front: 3, back: 1 },

  /** ステータス強化・弱体 */
  buff: { small: 0.15, normal: 0.25, large: 0.5, huge: 0.8 },
  buffTurns: 4,
  lingeringTurns: 3,
  battleLongTurns: 99,
  buffCap: { min: 0.5, max: 3.0 },

  /** 状態異常 */
  status: {
    poisonRatio: 0.06, // 1スタックあたり最大HPの何割
    poisonMaxStacks: 5,
    poisonTurns: 4,
    burnRatio: 0.07,
    burnAtkDown: 0.25,
    burnTurns: 3,
    confuseTurns: 2,
    baseChance: 0.75,
    weakBonus: 0.25,
    weakDamageMul: 1.5,
  },

  /** 敵の強さの層ごとの倍率（全体の難しさのつまみ。atk は魔力にも掛かる） */
  enemyScale: {
    1: { hp: 1.05, atk: 1.05 },
    2: { hp: 1.08, atk: 1.06 },
    3: { hp: 1.1, atk: 1.08 },
    4: { hp: 1.1, atk: 1.08 },
  } as Record<number, { hp: number; atk: number }>,
  /** 2層以降のボスだけにさらに掛ける倍率（消耗戦より山場で難しくする） */
  bossScale: { hp: 1.15, atk: 1.08 },

  /** 騎士・盗賊などの技に関わる倍率（職業ごとの差を縮めるための調整） */
  skill: {
    /** 「防御力が高いほど威力アップ」：1 + 防御 / この値 */
    defHighDiv: 15,
    /** 「自分のHPが減っているほど威力アップ」：1 + 減った割合 × この値 */
    selfHpLowMul: 2.0,
    /** 「毒の敵に威力アップ」「毒の敵なら威力特大」 */
    poisonedMul: 1.8,
    poisonedHugeMul: 2.6,
    /** 味方の反撃の威力（通常攻撃＝1.0） */
    counterPower: 1.4,
    /** 味方がかばったとき・挑発中に受けるダメージの倍率 */
    coverDamageMul: 0.7,
    tauntDamageMul: 0.8,
    /** 盗む・大泥棒の成功率 */
    stealChance: { normal: 0.9, rare: 0.75 },
  },

  /** 行動順：行動するたびに TIME_BASE / 素早さ だけ待ち時間が増える */
  timeBase: 1000,
  hasteRatio: 0.5,

  /** 経験値： 次のレベルまで */
  expToNext: (level: number) => Math.round(10 * Math.pow(level, 1.35)),
  /** 技の枠：全員この数で固定（レベルでは増えない） */
  skillSlots: 4,
  /** イベントなどで増やせる技の枠の上限（1人あたり） */
  maxSlotBonus: 2,
  maxLevel: 30,

  /** 持ち物（アイテム・本・装備をまとめて数える） */
  inventoryLimit: 12,
  startGold: 60,

  /** 休憩所 */
  restRatio: 0.4,

  /** 「たたかう」で敵に当てるとMPがたまる（最大MPの割合、最低値） */
  attackMp: { ratio: 0.12, min: 2 },

  /** 価格 */
  price: {
    item: { 安い: 15, 普通: 35, 高い: 70, とても高い: 140 } as Record<string, number>,
    book: { 通常: 45, レア: 120 },
    equipment: [40, 80, 140, 220, 320],
    accessory: { 通常: 70, レア: 160 },
    sellRatio: 0.5,
  },

  /** レアの出やすさ */
  rareChance: { normal: 0.08, elite: 0.35, shop: 0.12 },
  /** ショップでパーティーにいる職業の本が出る割合 */
  shopPartyJobRatio: 0.6,
};
