// パーティーの表示と、パーティー・持ち物画面（キャラのステータス・技・装備、持ち物の使用）。

import { ACCESSORY_BY_NAME, FLOORS, JOB_BY_NAME, SKILL_BY_NAME } from '../../data';
import { BLESSING_BY_NAME } from '../../data/blessings';
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
import type { Stat } from '../../engine/types';
import { STAT_LABEL } from '../../engine/types';
import type { App } from '../app';
import { icon, jobArt } from '../art';
import { ask, bar, choose, h, toast } from '../dom';
import { entryDetail, skillLine, statsText, traitLine } from '../describe';
import { inventoryView } from '../inventory';

/** 上の帯：場所・お金・持ち物・メニュー */
export function topBar(app: App, onChange?: () => void, opts: { menu?: boolean } = {}) {
  const run = app.run!;
  const floor = FLOORS[run.floor - 1];
  return h(
    'div',
    { class: 'topbar' },
    h('span', { class: 'place' }, `${run.floor}層 ${floor.place}`, run.ascension ? h('span', { class: 'asc-chip', title: `アセンション${run.ascension}` }, `A${run.ascension}`) : null),
    h(
      'span',
      { class: 'right' },
      (run.blessings ?? []).map((n) => h('span', { class: 'blessing-chip', title: BLESSING_BY_NAME.get(n)!.text }, icon('blessing', 12), n.replace('の加護', ''))),
      h('span', { class: 'stat-chip gold' }, icon('gold', 14), `${run.gold}G`),
      h('span', { class: 'stat-chip' }, icon('item', 14), `${run.inventory.length}/${inventoryLimit(run)}`),
      opts.menu === false ? null : h('button', { class: 'btn small', onclick: () => openParty(app, onChange) }, 'メニュー'),
    ),
  );
}

/** パーティーの小さな表示（2×2） */
export function partyGrid(run: RunState, opts: { activeId?: string } = {}) {
  return h(
    'div',
    { class: 'win party-grid' },
    run.party.map((c) => memberCard(c, { active: c.id === opts.activeId })),
  );
}

export function memberCard(c: Character, opts: { active?: boolean; hp?: number; mp?: number; maxHp?: number; maxMp?: number; badges?: HTMLElement[] } = {}) {
  const st = characterStats(c);
  const hp = opts.hp ?? c.hp;
  const mp = opts.mp ?? c.mp;
  const down = hp <= 0;
  return h(
    'div',
    { class: `member ${opts.active ? 'active' : ''} ${down ? 'down' : ''}` },
    jobArt(c.job, 28),
    h(
      'div',
      { class: 'm-head' },
      h('span', { class: 'nm' }, c.isHero ? '主人公' : c.name, opts.badges?.length ? h('span', { class: 'badges' }, opts.badges) : null),
      h('small', null, down ? '戦闘不能' : `Lv${c.level}`),
    ),
    bar(hp, opts.maxHp ?? st.hp, 'hp'),
    bar(mp, opts.maxMp ?? st.mp, 'mp'),
  );
}

/** これまでの画面で使っていた「帯＋パーティー」のまとめ */
export function partyBar(app: App, onChange?: () => void) {
  const run = app.run!;
  const frag = document.createDocumentFragment();
  frag.append(topBar(app, onChange), partyGrid(run));
  return frag;
}

// ───────────────────────── パーティー・持ち物画面 ─────────────────────────

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
    // 装備・使用などの操作のたびに保存する（開いたままブラウザを閉じても消えないように）
    app.save();
    const c = run.party.find((x) => x.id === selected) ?? run.party[0];
    const scroll = overlay.querySelector('.scroll');
    const top = scroll?.scrollTop ?? 0;
    overlay.replaceChildren(
      h(
        'div',
        { class: 'win', style: 'height:100%' },
        h('div', { class: 'map-head' }, h('h2', null, 'パーティー・持ち物'), h('button', { class: 'btn primary small', onclick: close }, '閉じる')),
        h(
          'div',
          { class: 'tabs' },
          run.party.map((p) =>
            h('button', { class: `tab ${p.id === c.id ? 'active' : ''}`, onclick: () => ((selected = p.id), render()) }, jobArt(p.job, 24), p.isHero ? '主人公' : p.name),
          ),
        ),
        h('div', { class: 'scroll grow' }, characterPanel(run, c, render), inventoryPanel(run, render)),
      ),
    );
    const s2 = overlay.querySelector('.scroll');
    if (s2) s2.scrollTop = top;
  };
  render();
  document.body.appendChild(overlay);
}

const SHOWN: Stat[] = ['atk', 'def', 'mag', 'spr', 'spd'];

function characterPanel(run: RunState, c: Character, rerender: () => void) {
  const st = characterStats(c);
  const job = JOB_BY_NAME.get(c.job)!;
  const next = BALANCE.expToNext(c.level);
  return h(
    'div',
    { class: 'win flat', style: 'margin-bottom:6px' },
    h(
      'div',
      { class: 'char-head' },
      jobArt(c.job, 48),
      h(
        'div',
        { style: 'flex:1;min-width:0' },
        h('h3', null, `${c.isHero ? '主人公' : c.name} Lv${c.level}`),
        h('p', null, `${job.name}・${job.lineage}・${job.role}`),
        traitLine(c.job),
        bar(c.hp, st.hp, 'hp'),
        bar(c.mp, st.mp, 'mp'),
        bar(c.exp, next, 'exp'),
      ),
      h(
        'button',
        {
          class: 'btn small',
          onclick: () => {
            c.row = c.row === 'front' ? 'back' : 'front';
            rerender();
          },
        },
        c.row === 'front' ? '前列' : '後列',
      ),
    ),
    h(
      'div',
      { class: 'stat-grid', style: 'margin-top:6px' },
      SHOWN.map((s) => h('div', null, h('b', null, STAT_LABEL[s]), Math.round(st[s]))),
    ),
    h('div', { class: 'section-title' }, `技（${c.skills.length}/${skillSlots(c)}枠）`),
    h(
      'ul',
      { class: 'skill-lines' },
      c.skills.map((n) => {
        const s = SKILL_BY_NAME.get(n)!;
        return h('li', null, h('span', { class: s.rare ? 'rare-text' : '' }, `${s.name}${s.rare ? '★' : ''}`), h('small', null, ` ${skillLine(s)}`));
      }),
      c.skills.length === 0 ? h('li', { class: 'muted' }, 'まだ技を覚えていない') : null,
    ),
    h('div', { class: 'section-title' }, '装備'),
    h(
      'div',
      { class: 'equip-lines' },
      icon('weapon', 16),
      h('span', null, c.weapon ?? 'なし', c.weapon ? h('small', null, ` ${statsText(equipmentDef(c.weapon).stats)}`) : null),
      h('span'),
      icon('armor', 16),
      h('span', null, c.armor ?? 'なし', c.armor ? h('small', null, ` ${statsText(equipmentDef(c.armor).stats)}`) : null),
      h('span'),
      ([0, 1] as const).flatMap((i) => {
        const a = c.accessories[i];
        return [
          icon('acc', 16),
          h(
            'span',
            null,
            a ? h('span', { class: ACCESSORY_BY_NAME.get(a)!.rare ? 'rare-text' : '' }, a) : h('span', { class: 'muted' }, 'なし'),
            a ? h('small', null, ` ${entryDetail({ kind: 'acc', name: a })}`) : null,
          ),
          a && c.cursed && i === 0
            ? h('span', { class: 'pill weak', title: 'アセンション10段の呪い。外せない' }, '呪い')
            : a
            ? h(
                'button',
                {
                  class: 'btn small',
                  onclick: () => {
                    const err = unequipAccessory(run, c.id, i);
                    if (err) toast(err);
                    rerender();
                  },
                },
                '外す',
              )
            : h('span'),
        ];
      }),
    ),
  );
}

function inventoryPanel(run: RunState, rerender: () => void) {
  return h(
    'div',
    { class: 'win flat' },
    h('div', { class: 'section-title' }, `持ち物（${run.inventory.length}/${inventoryLimit(run)}）`),
    inventoryView(run, (r) => h('div', { class: 'actions' }, actionButtons(run, r.index, rerender)), rerender),
  );
}

function actionButtons(run: RunState, index: number, rerender: () => void) {
  const e = run.inventory[index];
  const buttons: HTMLElement[] = [];
  // filter は「選べない理由」（選べるなら null）、info は選べる人に添える参考情報
  const pickChar = (title: string, filter: (c: Character) => string | null, info?: (c: Character) => string | null) =>
    choose(
      title,
      run.party.map((c) => {
        const why = filter(c);
        const note = why ?? info?.(c) ?? undefined;
        return { label: c.isHero ? `主人公（${c.job}）` : c.name, value: c.id, note, disabled: !!why };
      }),
    );

  if (e.kind === 'item' && fieldUsable(e.name)) {
    buttons.push(
      h(
        'button',
        {
          class: 'btn small',
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
          class: 'btn small',
          onclick: async () => {
            const who = await pickChar(`「${s.name}」をだれが読む？`, (c) => (c.job !== s.job ? `${s.job}専用` : c.skills.includes(s.name) ? '覚えている' : null));
            if (!who) return;
            const c = run.party.find((x) => x.id === who)!;
            let forget: string | undefined;
            if (c.skills.length >= skillSlots(c)) {
              const f = await choose(
                '技の枠がいっぱい。どれを忘れる？',
                c.skills.map((n) => ({ label: n, value: n, note: skillLine(SKILL_BY_NAME.get(n)!) })),
                '忘れた技は二度と戻らない。',
              );
              if (!f) return;
              forget = f;
            }
            const err = learnBook(run, index, who, forget);
            toast(err ?? `「${s.name}」を覚えた！`);
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
          class: 'btn small',
          onclick: async () => {
            const who = await pickChar(
              `${e.name} をだれが装備する？`,
              (c) => (JOB_BY_NAME.get(c.job)!.lineage !== d.lineage ? `${d.lineage}専用` : null),
              (c) => {
                const cur = d.slot === 'weapon' ? c.weapon : c.armor;
                return cur ? `いま：${cur}（${statsText(equipmentDef(cur).stats)}）` : null;
              },
            );
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
          class: 'btn small',
          onclick: async () => {
            const who = await pickChar(`${e.name} をだれが付ける？`, () => null);
            if (!who) return;
            const c = run.party.find((x) => x.id === who)!;
            let slot: 0 | 1 = c.accessories[0] === null ? 0 : c.accessories[1] === null ? 1 : 0;
            if (c.cursed) slot = 1; // 呪いの枠は使えない
            else if (c.accessories[0] && c.accessories[1]) {
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
        class: 'btn small danger',
        onclick: async () => {
          if (!(await ask(`${e.name} を捨てる？`, '捨てる'))) return;
          removeFromInventory(run, index);
          rerender();
        },
      },
      '捨てる',
    ),
  );
  return buttons;
}
