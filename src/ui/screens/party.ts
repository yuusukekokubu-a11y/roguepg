// パーティー画面：キャラのステータス・技・装備、持ち物の使用。

import { ACCESSORY_BY_NAME, JOB_BY_NAME, SKILL_BY_NAME } from '../../data';
import { BALANCE } from '../../engine/balance';
import { characterStats, skillSlots, type Character } from '../../engine/character';
import {
  equip,
  equipmentDef,
  fieldUsable,
  inventoryLimit,
  learnBook,
  removeFromInventory,
  unequipAccessory,
  useFieldItem,
  type RunState,
} from '../../engine/run';
import { STATS, STAT_LABEL } from '../../engine/types';
import type { App } from '../app';
import { ask, bar, choose, h, toast } from '../dom';
import { entryDetail, entryTitle, isRare, skillLine, statsText } from '../describe';

/** 画面上部に出す、パーティーの簡単な状態 */
export function partyBar(app: App, onChange?: () => void) {
  const run = app.run!;
  return h(
    'div',
    { class: 'party-bar' },
    h(
      'div',
      { class: 'party-mini' },
      run.party.map((c) => {
        const st = characterStats(c);
        return h(
          'div',
          { class: `mini-card ${c.hp <= 0 ? 'dead' : ''}` },
          h('div', { class: 'mini-name' }, `${JOB_BY_NAME.get(c.job)!.icon} ${c.name} Lv${c.level}`, h('small', null, c.row === 'front' ? '前列' : '後列')),
          bar(c.hp, st.hp, 'hp'),
          bar(c.mp, st.mp, 'mp'),
        );
      }),
    ),
    h(
      'div',
      { class: 'party-meta' },
      h('span', null, `💰 ${run.gold}G`),
      h('span', null, `🎒 ${run.inventory.length}/${inventoryLimit(run)}`),
      h('button', { class: 'small-btn', onclick: () => openParty(app, onChange) }, '👥 パーティー・持ち物'),
    ),
  );
}

export function openParty(app: App, onChange?: () => void) {
  const run = app.run!;
  let selected = run.party[0].id;
  const overlay = h('div', { class: 'overlay full' });
  const close = () => {
    overlay.remove();
    app.save();
    onChange?.();
  };
  const render = () => {
    const c = run.party.find((x) => x.id === selected) ?? run.party[0];
    overlay.replaceChildren(
      h(
        'div',
        { class: 'dialog wide' },
        h('div', { class: 'screen-head' }, h('h2', null, '👥 パーティー・持ち物'), h('button', { class: 'primary', onclick: close }, '閉じる')),
        h(
          'div',
          { class: 'tabs' },
          run.party.map((p) => h('button', { class: `tab ${p.id === c.id ? 'active' : ''}`, onclick: () => ((selected = p.id), render()) }, `${JOB_BY_NAME.get(p.job)!.icon} ${p.name}`)),
        ),
        characterPanel(run, c, render),
        inventoryPanel(run, render),
      ),
    );
  };
  render();
  document.body.appendChild(overlay);
}

function characterPanel(run: RunState, c: Character, rerender: () => void) {
  const st = characterStats(c);
  const job = JOB_BY_NAME.get(c.job)!;
  const next = BALANCE.expToNext(c.level);
  return h(
    'div',
    { class: 'panel char-panel' },
    h(
      'div',
      { class: 'char-head' },
      h('h3', null, `${job.icon} ${c.name}（${job.name}・${job.lineage}） Lv${c.level}`),
      h(
        'button',
        {
          class: 'small-btn',
          onclick: () => {
            c.row = c.row === 'front' ? 'back' : 'front';
            rerender();
          },
        },
        `隊列：${c.row === 'front' ? '前列' : '後列'}（切りかえ）`,
      ),
    ),
    h('div', { class: 'bars' }, bar(c.hp, st.hp, 'hp'), bar(c.mp, st.mp, 'mp'), bar(c.exp, next, 'exp')),
    h('div', { class: 'stat-row' }, STATS.filter((s) => s !== 'hp' && s !== 'mp').map((s) => h('span', { class: 'stat' }, h('b', null, STAT_LABEL[s]), Math.round(st[s])))),
    h('h4', null, `技（${c.skills.length}/${skillSlots(c)}枠）`),
    h(
      'ul',
      { class: 'skill-list' },
      c.skills.map((n) => {
        const s = SKILL_BY_NAME.get(n)!;
        return h('li', null, h('b', null, `${s.name}${s.rare ? '★' : ''}`), h('span', { class: 'muted small' }, ` ${skillLine(s)}`));
      }),
      c.skills.length === 0 ? h('li', { class: 'muted' }, 'まだ技を覚えていない') : null,
    ),
    h('h4', null, '装備'),
    h(
      'ul',
      { class: 'equip-list' },
      h('li', null, '武器：', c.weapon ? `${c.weapon}（${statsText(equipmentDef(c.weapon).stats)}）` : 'なし'),
      h('li', null, '防具：', c.armor ? `${c.armor}（${statsText(equipmentDef(c.armor).stats)}）` : 'なし'),
      ([0, 1] as const).map((i) => {
        const a = c.accessories[i];
        return h(
          'li',
          null,
          `アクセサリー${i + 1}：`,
          a ? h('span', null, `${a}${ACCESSORY_BY_NAME.get(a)!.rare ? '★' : ''}`, h('small', { class: 'muted' }, `（${entryDetail({ kind: 'acc', name: a })}）`)) : 'なし',
          a
            ? h(
                'button',
                {
                  class: 'tiny-btn',
                  onclick: () => {
                    const err = unequipAccessory(run, c.id, i);
                    if (err) toast(err);
                    rerender();
                  },
                },
                '外す',
              )
            : null,
        );
      }),
    ),
  );
}

function inventoryPanel(run: RunState, rerender: () => void) {
  return h(
    'div',
    { class: 'panel' },
    h('h3', null, `🎒 持ち物（${run.inventory.length}/${inventoryLimit(run)}）`),
    run.inventory.length === 0 ? h('p', { class: 'muted' }, '何も持っていない') : null,
    h(
      'ul',
      { class: 'inv-list' },
      run.inventory.map((e, i) =>
        h(
          'li',
          { class: isRare(e) ? 'rare' : '' },
          h('div', null, h('b', null, entryTitle(e)), h('div', { class: 'muted small' }, entryDetail(e))),
          h('div', { class: 'inv-actions' }, actionButtons(run, i, rerender)),
        ),
      ),
    ),
  );
}

function actionButtons(run: RunState, index: number, rerender: () => void) {
  const e = run.inventory[index];
  const buttons: HTMLElement[] = [];
  const pickChar = (title: string, filter: (c: Character) => string | null) =>
    choose(
      title,
      run.party.map((c) => {
        const why = filter(c);
        return { label: `${JOB_BY_NAME.get(c.job)!.icon} ${c.name}`, value: c.id, note: why ?? undefined, disabled: !!why };
      }),
    );

  if (e.kind === 'item' && fieldUsable(e.name)) {
    buttons.push(
      h(
        'button',
        {
          class: 'tiny-btn',
          onclick: async () => {
            const who = await pickChar(`${e.name} をだれに使う？`, () => null);
            if (!who) return;
            const err = useFieldItem(run, index, who);
            toast(err ?? `${e.name} を使った`);
            rerender();
          },
        },
        '使う',
      ),
    );
  }
  if (e.kind === 'book') {
    const s = SKILL_BY_NAME.get(e.name)!;
    buttons.push(
      h(
        'button',
        {
          class: 'tiny-btn',
          onclick: async () => {
            const who = await pickChar(`「${s.name}」をだれが読む？`, (c) => (c.job !== s.job ? `${s.job}専用` : c.skills.includes(s.name) ? '覚えている' : null));
            if (!who) return;
            const c = run.party.find((x) => x.id === who)!;
            let forget: string | undefined;
            if (c.skills.length >= skillSlots(c)) {
              const f = await choose(
                '技の枠がいっぱいです。どれを忘れますか？',
                c.skills.map((n) => ({ label: n, value: n, note: skillLine(SKILL_BY_NAME.get(n)!) })),
                '忘れた技は二度と戻りません。',
              );
              if (!f) return;
              forget = f;
            }
            const err = learnBook(run, index, who, forget);
            toast(err ?? `${c.name} は「${s.name}」を覚えた！`);
            rerender();
          },
        },
        '読む',
      ),
    );
  }
  if (e.kind === 'equip') {
    const d = equipmentDef(e.name);
    buttons.push(
      h(
        'button',
        {
          class: 'tiny-btn',
          onclick: async () => {
            const who = await pickChar(`${e.name} をだれが装備する？`, (c) => {
              if (JOB_BY_NAME.get(c.job)!.lineage !== d.lineage) return `${d.lineage}専用`;
              const cur = d.slot === 'weapon' ? c.weapon : c.armor;
              return cur ? `いま：${cur}（${statsText(equipmentDef(cur).stats)}）` : null;
            });
            if (!who) return;
            const err = equip(run, index, who);
            toast(err ?? `${e.name} を装備した`);
            rerender();
          },
        },
        '装備',
      ),
    );
  }
  if (e.kind === 'acc') {
    buttons.push(
      h(
        'button',
        {
          class: 'tiny-btn',
          onclick: async () => {
            const who = await pickChar(`${e.name} をだれが付ける？`, () => null);
            if (!who) return;
            const c = run.party.find((x) => x.id === who)!;
            let slot: 0 | 1 = c.accessories[0] === null ? 0 : c.accessories[1] === null ? 1 : 0;
            if (c.accessories[0] && c.accessories[1]) {
              const s = await choose(
                'どちらと付けかえる？',
                ([0, 1] as const).map((i) => ({ label: c.accessories[i]!, value: i })),
              );
              if (s === null) return;
              slot = s;
            }
            const err = equip(run, index, who, slot);
            toast(err ?? `${e.name} を付けた`);
            rerender();
          },
        },
        '付ける',
      ),
    );
  }
  buttons.push(
    h(
      'button',
      {
        class: 'tiny-btn danger',
        onclick: async () => {
          if (!(await ask(`${e.name} を捨てますか？`, '捨てる'))) return;
          removeFromInventory(run, index);
          rerender();
        },
      },
      '捨てる',
    ),
  );
  return buttons;
}
