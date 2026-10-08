// アクセサリーの効果を「アクセサリー部品」の組み合わせで表したもの。
// 名前は企画書の「アクセサリー」シートと一致させる（テストで確認している）。

import type { Stat, StatusId } from '../engine/types';

export type AccCondition = 'hpLowThird' | 'hpFull' | 'statused' | 'front' | 'back' | 'solo' | 'allyDown';

export interface AccessoryMod {
  // 常に効く
  statMul?: Partial<Record<Stat, number>>; // 1.2 = 20%アップ
  statMulIf?: { cond: AccCondition; stats: Partial<Record<Stat, number>> }[];
  alwaysStatus?: StatusId; // 常に◯◯状態
  alwaysTaunt?: boolean;
  immune?: StatusId[];
  statusResistMul?: number; // かかりやすさの倍率
  noSupport?: boolean; // 味方からの回復・強化を受けられない
  attackOnly?: boolean; // 通常攻撃しかできない
  evasionAdd?: number;
  evasionIf?: { cond: AccCondition; add: number };
  magicDamageTakenMul?: number;
  /** 受けるダメージの倍率（加護用） */
  damageTakenMul?: number;
  /** 戦闘に勝ったとき、倒れていたらこの割合のHPで起き上がる（加護用） */
  reviveAfterBattle?: number;
  regenRatio?: number; // 毎ターン最大HPの割合回復
  hpDrainRatio?: number; // 毎ターン最大HPの割合ダメージ

  // きっかけ
  onDamagedAtkUp?: number;
  onKillHaste?: boolean;
  battleStartFastest?: boolean;
  battleStartDoubleAction?: boolean;
  battleEndMpRatio?: number;
  allyDownAllUp?: number;
  endureOnce?: 'battle' | 'run'; // 不死鳥の羽（戦闘中1回）／身代わり人形（1回で壊れる）
  endureAtFullHp?: boolean;

  // 技を変える
  target?: { from: 'single' | 'all' | 'front' | 'ally'; to: 'all' | 'single' | 'random2' | 'allyAll'; powerMul: number; mpMul: number };
  mpCostMul?: number;
  powerMul?: number;
  hpInsteadOfMp?: boolean;
  mpDebtWithHp?: boolean;
  mpFree?: boolean;
  gamble?: boolean;
  statusedPowerMul?: number; // 自分が状態異常のとき威力アップ
  hpFullPowerMul?: number;
  noCharge?: number; // 溜め不要（威力倍率）
  chargeMul?: number; // 溜め技の威力アップ
  extraHit?: number; // 複数回攻撃の回数＋1（1回ごとの威力倍率）
  physicalLifesteal?: boolean;
  physicalStatus?: StatusId;
  magicStatus?: StatusId;
  confuseOnHitChance?: number;
  poisonDamageMul?: number;
  statusDurationMul?: number;
  counterMul?: number;
  coverDamageMul?: number;
  lingeringPlus?: number;
  healMul?: number;
  reviveHalf?: boolean;
  buffMul?: number;
  shareBuffs?: boolean;
  healSpill?: number;

  // お金・報酬
  goldMul?: number;
  shopDiscount?: number;
  sellMul?: number;
  bookDropUp?: boolean;
  inventoryPlus?: number;
  goldOnAttack?: number;
}

export const ACCESSORY_MODS: Record<string, AccessoryMod> = {
  // 対象を変える
  拡散の指輪: { target: { from: 'single', to: 'all', powerMul: 0.5, mpMul: 1 } },
  集束のお守り: { target: { from: 'all', to: 'single', powerMul: 1.5, mpMul: 1 } },
  前衛の紋章: { target: { from: 'front', to: 'all', powerMul: 1, mpMul: 1.5 } },
  気まぐれのサイコロ: { target: { from: 'single', to: 'random2', powerMul: 1, mpMul: 1 } },
  分け身の鏡: { target: { from: 'ally', to: 'allyAll', powerMul: 1, mpMul: 2 } },
  // コストを変える
  血の契約: { hpInsteadOfMp: true },
  節約の腕輪: { mpCostMul: 0.7, powerMul: 0.8 },
  魔力の借金: { mpDebtWithHp: true },
  生命の泉石: { battleEndMpRatio: 0.15 },
  無限の杯: { mpFree: true, hpDrainRatio: 0.06 },
  // 条件で発動
  背水の指輪: { statMulIf: [{ cond: 'hpLowThird', stats: { atk: 1.5, mag: 1.5 } }] },
  余裕のブローチ: { hpFullPowerMul: 1.3 },
  怒りの首飾り: { onDamagedAtkUp: 0.08 },
  先駆けの羽: { battleStartFastest: true },
  狩人の勘: { onKillHaste: true },
  弔いの指輪: { allyDownAllUp: 0.5 },
  孤高の指輪: { statMulIf: [{ cond: 'solo', stats: { atk: 1.8, def: 1.8, mag: 1.8, spr: 1.8, spd: 1.8 } }] },
  不死鳥の羽: { endureOnce: 'battle' },
  // 状態異常
  毒牙のピアス: { physicalStatus: 'poison' },
  炎の指輪: { magicStatus: 'burn' },
  混沌のお守り: { confuseOnHitChance: 0.15 },
  毒使いの手袋: { poisonDamageMul: 1.6 },
  疫病の王冠: { statusDurationMul: 2 },
  呪われた首輪: { statMul: { atk: 1.5 }, alwaysStatus: 'poison' },
  逆転の紋章: { statusedPowerMul: 1.4 },
  毒除けのお守り: { immune: ['poison'] },
  万能のお守り: { statusResistMul: 0.4 },
  // 行動を変える
  瞬きの指輪: { noCharge: 0.7 },
  忍耐の帯: { chargeMul: 1.4, statMul: { spd: 0.8 } },
  双子の指輪: { extraHit: 0.75 },
  吸血の牙: { physicalLifesteal: true },
  反射の盾片: { counterMul: 1.6 },
  影の外套: { evasionAdd: 0.2, statMul: { def: 0.8 } },
  挑発の角笛: { alwaysTaunt: true },
  守り手の誓い: { coverDamageMul: 0.5 },
  長き調べの笛: { lingeringPlus: 1 },
  時の砂時計: { battleStartDoubleAction: true },
  // 回復・支援
  慈愛のロザリオ: { healMul: 1.4, statMul: { atk: 0.8 } },
  祈りの数珠: { regenRatio: 0.04 },
  聖者の加護: { reviveHalf: true },
  歌い手の喉飾り: { buffMul: 1.5 },
  共鳴の鈴: { shareBuffs: true },
  天使の輪: { healSpill: 0.3 },
  // 守り
  前衛の鎧飾り: { statMulIf: [{ cond: 'front', stats: { def: 1.5 } }] },
  後衛のマント: { evasionIf: { cond: 'back', add: 0.2 } },
  魔法障壁の護符: { magicDamageTakenMul: 0.7 },
  根性のハチマキ: { endureAtFullHp: true },
  身代わり人形: { endureOnce: 'run' },
  // お金・報酬
  金運の財布: { goldMul: 1.5 },
  値切りの口上: { shopDiscount: 0.2 },
  商人の秤: { sellMul: 1.6 },
  目利きの眼鏡: { bookDropUp: true },
  欲張りの袋: { inventoryPlus: 2, statMul: { spd: 0.9 } },
  黄金の手: { goldOnAttack: 3 },
  // ハイリスク
  ガラスの剣飾り: { statMul: { atk: 1.8, mag: 1.8, hp: 0.5 } },
  鈍重の鎖: { statMul: { def: 1.5, spd: 0.6 } },
  賭博師のコイン: { gamble: true },
  寡黙の指輪: { statMul: { atk: 1.5 }, noSupport: true },
  狂戦士の仮面: { statMul: { atk: 1.9 }, attackOnly: true },
  // ステータス
  力の指輪: { statMul: { atk: 1.15 } },
  守りの指輪: { statMul: { def: 1.15 } },
  魔力の指輪: { statMul: { mag: 1.15 } },
  精神の指輪: { statMul: { spr: 1.15 } },
  疾風の指輪: { statMul: { spd: 1.12 } },
  生命の指輪: { statMul: { hp: 1.15 } },
  魔素の指輪: { statMul: { mp: 1.2 } },
};
