// 加護：3層クリアの報酬。パーティー全員に、ランの最後まで効き続ける。
// 効果はアクセサリーと同じ部品（AccessoryMod）で表す。

import type { AccessoryMod } from './accessoryMods';

export interface BlessingDef {
  name: string;
  icon: string;
  text: string;
  mod: AccessoryMod;
}

export const BLESSINGS: BlessingDef[] = [
  { name: '勇者の加護', icon: '⚔️', text: '全員の攻撃力・魔力が20%上がる', mod: { statMul: { atk: 1.2, mag: 1.2 } } },
  { name: '守護の加護', icon: '🛡️', text: '全員の受けるダメージが15%減る', mod: { damageTakenMul: 0.85 } },
  { name: '疾風の加護', icon: '🌪️', text: '全員の素早さが15%上がる', mod: { statMul: { spd: 1.15 } } },
  { name: '癒しの加護', icon: '🌿', text: '全員、自分の番が来るたびに最大HPの5%回復する', mod: { regenRatio: 0.05 } },
  { name: '魔力の加護', icon: '🔷', text: '戦闘が終わるたびに、全員のMPが最大の25%回復する', mod: { battleEndMpRatio: 0.25 } },
  { name: '浄化の加護', icon: '✨', text: '全員、状態異常にかかりにくくなる（半分）', mod: { statusResistMul: 0.5 } },
  { name: '不屈の加護', icon: '🔥', text: '全員、戦闘中1回だけ倒れる攻撃をHP1で耐える', mod: { endureOnce: 'battle' } },
  { name: '再起の加護', icon: '🕊️', text: '戦闘に勝つと、倒れた仲間がHP30%で起き上がる', mod: { reviveAfterBattle: 0.3 } },
];

export const BLESSING_BY_NAME = new Map(BLESSINGS.map((b) => [b.name, b]));
