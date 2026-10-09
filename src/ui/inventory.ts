// 持ち物の一覧：種類ごとに分けて並べ、同じ物はまとめて「×2」と表示する。
// パーティー画面・報酬画面・ショップ（売る）で共通に使う。

import { JOBS, SKILL_BY_NAME } from '../data';
import { equipmentDef, type InvEntry, type InvKind, type RunState } from '../engine/run';
import { entryDetail, entryTitle, isRare } from './describe';
import { entryIcon } from './art';
import { h } from './dom';

export const KIND_LABEL: Record<InvKind, string> = { item: 'どうぐ', book: '本', equip: '装備', acc: 'アクセサリー' };
const KIND_ORDER: InvKind[] = ['item', 'book', 'equip', 'acc'];
const JOB_ORDER = new Map(JOBS.map((j, i) => [j.name, i]));

export interface InvRow {
  entry: InvEntry;
  /** run.inventory の中で最初に見つかった位置（使う・捨てる・売るはこの1個に対して行う） */
  index: number;
  count: number;
}

/** 表示中の種類（画面を作り直しても覚えておく） */
let filter: InvKind | 'all' = 'all';
/** 直前に手に入れた物（一覧で光らせる） */
let fresh: string | null = null;
export function markFresh(e: InvEntry) {
  fresh = `${e.kind}:${e.name}`;
}

function sortKey(e: InvEntry): (string | number)[] {
  switch (e.kind) {
    case 'book': {
      const s = SKILL_BY_NAME.get(e.name)!;
      return [JOB_ORDER.get(s.job) ?? 99, s.rare ? 1 : 0, e.name];
    }
    case 'equip': {
      const d = equipmentDef(e.name);
      return [d.slot === 'weapon' ? 0 : 1, -d.tier, e.name];
    }
    default:
      return [isRare(e) ? 1 : 0, e.name];
  }
}
function compare(a: InvEntry, b: InvEntry) {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

/** 種類ごと・同じ物をまとめた並び */
export function groupInventory(run: RunState): Map<InvKind, InvRow[]> {
  const rows = new Map<string, InvRow>();
  run.inventory.forEach((entry, index) => {
    const key = `${entry.kind}:${entry.name}`;
    const r = rows.get(key);
    if (r) r.count++;
    else rows.set(key, { entry, index, count: 1 });
  });
  const out = new Map<InvKind, InvRow[]>();
  for (const k of KIND_ORDER) {
    const list = [...rows.values()].filter((r) => r.entry.kind === k).sort((a, b) => compare(a.entry, b.entry));
    if (list.length) out.set(k, list);
  }
  return out;
}

/**
 * 持ち物の一覧。上に種類のタブ、下に種類ごとの見出し付きリスト。
 * actions には、その行の右側に置くボタンを返す関数を渡す。
 */
export function inventoryView(run: RunState, actions: (row: InvRow) => HTMLElement | HTMLElement[] | null, rerender: () => void, empty = '何も持っていない') {
  if (run.inventory.length === 0) return h('p', { class: 'muted small' }, empty);
  const groups = groupInventory(run);
  if (filter !== 'all' && !groups.has(filter)) filter = 'all';
  const count = (k: InvKind) => run.inventory.filter((e) => e.kind === k).length;
  const tabs = h(
    'div',
    { class: 'inv-tabs' },
    h('button', { class: `chip-tab ${filter === 'all' ? 'active' : ''}`, onclick: () => ((filter = 'all'), rerender()) }, `すべて ${run.inventory.length}`),
    [...groups.keys()].map((k) => h('button', { class: `chip-tab ${filter === k ? 'active' : ''}`, onclick: () => ((filter = k), rerender()) }, `${KIND_LABEL[k]} ${count(k)}`)),
  );
  const flash = fresh;
  fresh = null;
  const list = h(
    'ul',
    { class: 'list inv-list' },
    [...groups.entries()]
      .filter(([k]) => filter === 'all' || filter === k)
      .map(([k, rows]) => [
        filter === 'all' ? h('li', { class: 'inv-head' }, KIND_LABEL[k]) : null,
        rows.map((r) =>
          h(
            'li',
            { class: `${isRare(r.entry) ? 'rare' : ''} ${flash === `${r.entry.kind}:${r.entry.name}` ? 'fresh' : ''}` },
            entryIcon(r.entry, 18),
            h(
              'div',
              null,
              h('div', { class: 'name' }, entryTitle(r.entry), r.count > 1 ? h('span', { class: 'count' }, ` ×${r.count}`) : null),
              h('div', { class: 'desc' }, entryDetail(r.entry)),
            ),
            actions(r),
          ),
        ),
      ]),
  );
  return h('div', { class: 'inv-view' }, tabs, list);
}
