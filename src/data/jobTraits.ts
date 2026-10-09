// 職業の特性：その職業のキャラクターにいつも効いている能力（企画書にない追加）。
// 職業ごとの強さの差を縮めるため、弱い職業ほど強めにしている。効果はアクセサリーと同じ部品で表す。

import type { AccessoryMod } from './accessoryMods';

export interface JobTrait {
  name: string;
  text: string;
  mod: AccessoryMod;
}

export const JOB_TRAITS: Record<string, JobTrait> = {
  戦士: { name: '闘志', text: '受けるダメージ-8%。ダメージを受けるたびに攻撃力が上がる（戦闘中）', mod: { damageTakenMul: 0.92, onDamagedAtkUp: 0.08 } },
  騎士: { name: '守護者', text: '受けるダメージ-15%。自分の番ごとにHPが3%回復', mod: { damageTakenMul: 0.85, regenRatio: 0.03 } },
  暗黒騎士: { name: '血の渇き', text: '物理攻撃で与えたダメージの一部を吸収する', mod: { physicalLifesteal: true } },
  侍: { name: '不退転', text: '戦闘中1回だけ、倒れずにHP1で踏みとどまる', mod: { endureOnce: 'battle' } },
  白魔道士: { name: '清らかな心', text: '状態異常にかかりにくい', mod: { statusResistMul: 0.7 } },
  黒魔道士: { name: '魔力の泉', text: '魔力+10%。戦闘に勝つとMPが30%回復', mod: { battleEndMpRatio: 0.3, statMul: { mag: 1.1 } } },
  赤魔道士: { name: '器用', text: '戦闘に勝つとMPが10%回復', mod: { battleEndMpRatio: 0.1 } },
  呪術師: { name: '呪いの心得', text: '受けるダメージ-10%。状態異常にかかりにくく、かけた状態異常が長く続く', mod: { damageTakenMul: 0.9, statusResistMul: 0.5, statusDurationMul: 1.5 } },
  盗賊: { name: '身軽', text: '戦闘のはじめに必ず最初に動く。回避+20%・攻撃力+10%', mod: { battleStartFastest: true, evasionAdd: 0.2, statMul: { atk: 1.1 } } },
  狩人: { name: '狩りの本能', text: '敵を倒すと次の番が早く来る。回避+8%', mod: { onKillHaste: true, evasionAdd: 0.08 } },
  錬金術師: { name: '調合上手', text: '回復量+15%', mod: { healMul: 1.15 } },
  吟遊詩人: { name: '響く声', text: '強化の効果が15%大きい', mod: { buffMul: 1.15 } },
  踊り子: { name: '華麗な足さばき', text: '回避+10%', mod: { evasionAdd: 0.1 } },
  召喚士: { name: '契約の守り', text: '受けるダメージ-10%。戦闘に勝つとMPが15%回復', mod: { damageTakenMul: 0.9, battleEndMpRatio: 0.15 } },
};

/** 企画書の本に加えた本（回復手段のない職業に1冊ずつ） */
export const EXTRA_BOOKS = [
  { lineage: '剣士系', job: '侍', archetype: '見切り型', name: '残心', rarity: '通常', target: '自分', cost: 'MP小', effect: 'HP回復中' },
  { lineage: '魔法系', job: '黒魔道士', archetype: '一撃型', name: '魔力吸収', rarity: '通常', target: '単体', cost: 'MP中', effect: '魔法ダメージ中＋吸収' },
  { lineage: '魔法系', job: '呪術師', archetype: '弱体型', name: '厄払い', rarity: '通常', target: '味方単体', cost: 'MP小', effect: 'HP回復小＋状態異常を治す' },
  { lineage: '技巧系', job: '盗賊', archetype: '強奪型', name: '手当て', rarity: '通常', target: '味方単体', cost: 'MP小', effect: 'HP回復小＋状態異常を治す' },
  { lineage: '技巧系', job: '狩人', archetype: '罠型', name: '薬草の知恵', rarity: '通常', target: '味方単体', cost: 'MP小', effect: 'HP回復中' },
];
