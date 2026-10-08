// 持ち物・技などの説明文を作る。

import { ACCESSORY_BY_NAME, ITEM_BY_NAME, SKILL_BY_NAME, type SkillDef } from '../data';
import { equipmentDef, type InvEntry } from '../engine/run';
import { STAT_LABEL, type Cost, type Stat, type TargetKind } from '../engine/types';

export const TARGET_LABEL: Record<TargetKind, string> = {
  enemy: '敵単体',
  enemyAll: '敵全体',
  enemyFront: '敵前列',
  random: 'ランダム',
  self: '自分',
  ally: '味方単体',
  allyAll: '味方全体',
  none: '—',
};

export function costLabel(c: Cost): string {
  if (c.kind === 'none') return 'コストなし';
  const size = { small: '小', medium: '中', large: '大', all: '全部' }[c.size];
  return `${c.kind.toUpperCase()}${size}`;
}

export const KIND_LABEL: Record<InvEntry['kind'], string> = { item: 'アイテム', book: 'スキルブック', equip: '装備', acc: 'アクセサリー' };

export function statsText(stats: Partial<Record<Stat, number>>): string {
  return Object.entries(stats)
    .map(([k, v]) => `${STAT_LABEL[k as Stat]}${v! >= 0 ? '+' : ''}${v}`)
    .join(' ');
}

export function skillLine(s: SkillDef): string {
  return `${TARGET_LABEL[s.target]}｜${costLabel(s.cost)}｜${s.text}`;
}

export function entryTitle(e: InvEntry): string {
  const rare = isRare(e) ? '★' : '';
  return `${e.name}${rare}`;
}

export function isRare(e: InvEntry): boolean {
  if (e.kind === 'book') return SKILL_BY_NAME.get(e.name)!.rare;
  if (e.kind === 'acc') return ACCESSORY_BY_NAME.get(e.name)!.rare;
  if (e.kind === 'item') return ITEM_BY_NAME.get(e.name)!.rare;
  return false;
}

export function entryDetail(e: InvEntry): string {
  switch (e.kind) {
    case 'book': {
      const s = SKILL_BY_NAME.get(e.name)!;
      return `${s.job}の本（${s.archetype}）｜${skillLine(s)}`;
    }
    case 'item': {
      const it = ITEM_BY_NAME.get(e.name)!;
      return `${TARGET_LABEL[it.target]}｜${it.text}`;
    }
    case 'equip': {
      const d = equipmentDef(e.name);
      return `${d.lineage}の${d.slot === 'weapon' ? '武器' : '防具'}｜${statsText(d.stats)}`;
    }
    case 'acc': {
      const a = ACCESSORY_BY_NAME.get(e.name)!;
      const drawback = a.drawback && a.drawback !== '—' ? `｜デメリット：${a.drawback}` : '';
      return `${a.text}${drawback}`;
    }
  }
}
