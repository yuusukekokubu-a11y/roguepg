// 武器・防具（企画書に一覧がないため、ここで作成）。
// 武器・防具は「性能」担当なので、素直にステータスが上がるだけにしている。
// tier（段階）0〜3。1層では 0〜1 が出る。

import type { Stat } from '../engine/types';

export type Lineage = '剣士系' | '魔法系' | '技巧系' | '支援系';
export const LINEAGES: Lineage[] = ['剣士系', '魔法系', '技巧系', '支援系'];

export interface EquipmentDef {
  name: string;
  slot: 'weapon' | 'armor';
  lineage: Lineage;
  tier: number;
  stats: Partial<Record<Stat, number>>;
}

const W = (lineage: Lineage, tier: number, name: string, stats: EquipmentDef['stats']): EquipmentDef => ({
  name,
  slot: 'weapon',
  lineage,
  tier,
  stats,
});
const A = (lineage: Lineage, tier: number, name: string, stats: EquipmentDef['stats']): EquipmentDef => ({
  name,
  slot: 'armor',
  lineage,
  tier,
  stats,
});

export const EQUIPMENT: EquipmentDef[] = [
  // 剣士系：攻撃と防御が素直に上がる
  W('剣士系', 0, '銅の剣', { atk: 3 }),
  W('剣士系', 1, '鋼の剣', { atk: 6 }),
  W('剣士系', 2, '騎士の大剣', { atk: 10 }),
  W('剣士系', 3, '英雄の剣', { atk: 15, spd: 1 }),
  A('剣士系', 0, '革の鎧', { def: 3 }),
  A('剣士系', 1, '鎖かたびら', { def: 6, hp: 5 }),
  A('剣士系', 2, '鋼の鎧', { def: 10, hp: 10 }),
  A('剣士系', 3, '竜鱗の鎧', { def: 15, hp: 20 }),
  // 魔法系：魔力・精神が上がる
  W('魔法系', 0, '木の杖', { mag: 3, atk: 4 }),
  W('魔法系', 1, '魔導の杖', { mag: 6, atk: 6, mp: 3 }),
  W('魔法系', 2, '賢者の杖', { mag: 10, atk: 8, spr: 2, mp: 6 }),
  W('魔法系', 3, '星詠みの杖', { mag: 15, atk: 10, spr: 4, mp: 10 }),
  A('魔法系', 0, '布のローブ', { def: 1, spr: 2 }),
  A('魔法系', 1, '魔法のローブ', { def: 3, spr: 4 }),
  A('魔法系', 2, '聖なる法衣', { def: 5, spr: 7, mp: 5 }),
  A('魔法系', 3, '大魔導の衣', { def: 8, spr: 11, mp: 10 }),
  // 技巧系：攻撃と素早さ
  W('技巧系', 0, 'ナイフ', { atk: 2, spd: 1 }),
  W('技巧系', 1, '狩猟の弓', { atk: 5, spd: 1 }),
  W('技巧系', 2, '鋭い短剣', { atk: 8, spd: 2 }),
  W('技巧系', 3, '風切りの弓', { atk: 12, spd: 3 }),
  A('技巧系', 0, '旅人の服', { def: 2 }),
  A('技巧系', 1, '革の胸当て', { def: 4, spd: 1 }),
  A('技巧系', 2, '影のチョッキ', { def: 7, spd: 2 }),
  A('技巧系', 3, '疾風の装束', { def: 10, spd: 3 }),
  // 支援系：精神と素早さ、少し魔力
  W('支援系', 0, '樫の竪琴', { atk: 3, mag: 2, spr: 1 }),
  W('支援系', 1, '銀の扇', { atk: 5, mag: 3 }),
  W('支援系', 2, '精霊の鈴', { atk: 7, mag: 6, spr: 3 }),
  W('支援系', 3, '天上の竪琴', { atk: 9, mag: 9, spr: 5, spd: 2 }),
  A('支援系', 0, '踊り子の衣', { def: 1, spd: 1 }),
  A('支援系', 1, '詩人の外套', { def: 3, spr: 2 }),
  A('支援系', 2, '月光のドレス', { def: 5, spr: 4, spd: 1 }),
  A('支援系', 3, '星の羽衣', { def: 8, spr: 6, spd: 2 }),
];
