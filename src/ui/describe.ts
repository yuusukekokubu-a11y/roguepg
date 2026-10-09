// 持ち物・技などの説明文を作る。

import { ACCESSORY_BY_NAME, ITEM_BY_NAME, JOB_BY_NAME, SKILL_BY_NAME, type SkillDef } from '../data';
import { JOB_TRAITS } from '../data/jobTraits';
import { equipmentDef, type InvEntry, type RunState } from '../engine/run';
import { h } from './dom';
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

/** 職業の特性の1行 */
export function traitLine(job: string): HTMLElement | null {
  const t = JOB_TRAITS[job];
  return t ? h('p', { class: 'trait' }, `特性「${t.name}」${t.text}`) : null;
}

/** 装備が、パーティーのだれの今の装備より強いか（「↑ 主人公・騎士」）。装備以外は null */
export function equipHint(run: RunState, e: InvEntry): HTMLElement | null {
  if (e.kind !== 'equip') return null;
  const d = equipmentDef(e.name);
  const users = run.party.filter((c) => JOB_BY_NAME.get(c.job)!.lineage === d.lineage);
  if (users.length === 0) return h('div', { class: 'equip-hint none' }, `${d.lineage}の仲間がいない`);
  const better = users.filter((c) => {
    const cur = d.slot === 'weapon' ? c.weapon : c.armor;
    return !cur || equipmentDef(cur).tier < d.tier;
  });
  if (better.length === 0) return h('div', { class: 'equip-hint none' }, '今の装備と同じか弱い');
  return h('div', { class: 'equip-hint up' }, `↑ ${better.map((c) => (c.isHero ? '主人公' : c.name)).join('・')}より強い`);
}
