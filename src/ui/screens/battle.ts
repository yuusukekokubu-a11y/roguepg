// 戦闘画面。上から「帯 → 行動順 → 戦場 → メッセージ → パーティー → コマンド」。

import { ITEM_BY_NAME, SKILL_BY_NAME } from '../../data';
import enemiesJson from '../../data/generated/enemies.json';
import { Battle, type Command, type Unit } from '../../engine/battle';
import { battleHooks, battleRewards, bossCleared, clearSave } from '../../engine/run';
import { STATUS_LABEL, STAT_LABEL, type Effect, type StatusId, type TargetKind } from '../../engine/types';
import type { App } from '../app';
import { enemyArt, floorBackground, jobArt } from '../art';
import { bar, h, sleep, toast } from '../dom';
import { TARGET_LABEL, costLabel } from '../describe';
import { topBar } from './party';

type Mode =
  | { kind: 'root' }
  | { kind: 'skills' }
  | { kind: 'items' }
  | { kind: 'target'; label: string; target: 'enemy' | 'ally'; effects: Effect[]; make: (uid: number) => Command };

const FEATURE = new Map(enemiesJson.map((e) => [e.name, e.feature]));

export function battleScreen(app: App, screen: { enemies: string[]; kind: 'normal' | 'elite' | 'boss'; boss: boolean }) {
  const run = app.run!;
  const battle = new Battle(run.party, screen.enemies, screen.kind, battleHooks(run));
  const root = h('div', { class: `screen battle ${screen.kind}` });
  let mode: Mode = { kind: 'root' };
  let infoUid: number | null = null;
  const prevHp = new Map<number, number>();
  let busy = false;
  const bg = floorBackground(run.floor);

  const render = () => {
    const targetable = new Set<number>();
    if (mode.kind === 'target' && battle.current) {
      for (const u of battle.selectableTargets(battle.current, mode.target, mode.effects)) targetable.add(u.uid);
    }
    const changed = (u: Unit) => {
      const before = prevHp.get(u.uid) ?? u.hp;
      prevHp.set(u.uid, u.hp);
      return before > u.hp ? 'hit' : before < u.hp ? 'healed' : '';
    };
    const onUnit = (u: Unit) => () => {
      if (mode.kind === 'target' && targetable.has(u.uid)) return submit(mode.make(u.uid));
      if (u.side === 'enemy') {
        infoUid = infoUid === u.uid ? null : u.uid;
        render();
      }
    };

    const enemies = battle.units.filter((u) => u.side === 'enemy');
    const foeEl = (u: Unit) => {
      const size = u.enemy?.kind === 'boss' ? 60 : u.row === 'back' ? 44 : 54;
      const cls = ['foe', u.hp <= 0 ? 'dead' : '', changed(u), targetable.has(u.uid) ? 'targetable' : '', infoUid === u.uid ? 'target' : ''].join(' ');
      return h(
        'button',
        { class: cls, type: 'button', onclick: onUnit(u) },
        enemyArt(u.enemy!.name, size),
        h('span', { class: 'plate' }, h('span', { class: 'pname' }, u.name), bar(u.hp, battle.maxHp(u), 'hp', false), statusBadges(u).length ? h('span', { class: 'badges' }, statusBadges(u)) : null),
      );
    };
    const infoUnit = enemies.find((u) => u.uid === infoUid && u.hp > 0);

    const order = battle.turnOrder(8);
    root.replaceChildren(
      topBar(app, undefined, { menu: false }),
      h(
        'div',
        { class: 'win order', 'aria-label': '行動順' },
        h('span', { class: 'order-label' }, '行動順'),
        order.map((o, i) => [
          i ? h('span', { class: 'arrow' }, '›') : null,
          h(
            'span',
            { class: `chip ${o.unit.side === 'enemy' ? 'enemy' : ''} ${i === 0 ? 'now' : ''}`, title: o.unit.name },
            o.unit.side === 'enemy' ? enemyArt(o.unit.enemy!.name, 26) : jobArt(o.unit.char!.job, 26),
            letter(o.unit),
            o.charging ? h('span', { class: 'charge' }, '溜め') : null,
          ),
        ]),
      ),
      h(
        'div',
        { class: 'stage' },
        h('img', { class: 'px bg', src: bg, alt: '' }),
        h(
          'div',
          { class: 'rows' },
          h('div', { class: 'row back' }, enemies.filter((u) => u.row === 'back').map(foeEl)),
          h('div', { class: 'row front' }, enemies.filter((u) => u.row === 'front').map(foeEl)),
        ),
        infoUnit ? enemyInfo(battle, infoUnit) : null,
        battle.phase === 'won' ? h('div', { class: 'result-banner' }, screen.boss ? 'ボス撃破' : '勝利') : null,
        battle.phase === 'lost' ? h('div', { class: 'result-banner lost' }, '全滅') : null,
      ),
      messageWindow(battle),
      h(
        'div',
        { class: 'win party-grid' },
        battle.units
          .filter((u) => u.side === 'player')
          .map((u) => {
            const cls = ['member', battle.current === u && battle.phase === 'input' ? 'active' : '', u.hp <= 0 ? 'down' : '', targetable.has(u.uid) ? 'targetable' : '', changed(u)].join(' ');
            return h(
              'div',
              { class: cls, onclick: onUnit(u) },
              jobArt(u.char!.job, 28),
              h(
                'div',
                { class: 'm-head' },
                h('span', { class: 'nm' }, u.char!.isHero ? '主人公' : u.name, h('span', { class: 'badges' }, statusBadges(u))),
                h('small', null, u.hp <= 0 ? '戦闘不能' : `${u.row === 'front' ? '前' : '後'} Lv${u.char!.level}`),
              ),
              bar(u.hp, battle.maxHp(u), 'hp'),
              bar(u.mp, battle.maxMp(u), 'mp'),
            );
          }),
      ),
      commandWindow(),
    );
  };

  const commandWindow = () => {
    if (battle.phase === 'won' || battle.phase === 'lost' || battle.phase === 'escaped') {
      return h('div', { class: 'win cmdwin' }, h('button', { class: 'btn primary wide', onclick: finish }, 'つぎへ'));
    }
    const u = battle.current;
    if (battle.phase !== 'input' || !u) return h('div', { class: 'win cmdwin' }, h('div', { class: 'cmd-title' }, '……'), h('div', { style: 'height:68px' }));
    const who = u.char!.isHero ? '主人公' : u.name;
    const head = h(
      'div',
      { class: 'cmd-title' },
      h('span', null, h('b', null, who), u.extraActions > 0 ? ` は続けて行動できる（あと${u.extraActions + 1}回）` : ' は どうする？'),
      mode.kind !== 'root' ? h('button', { class: 'btn small', onclick: () => ((mode = { kind: 'root' }), render()) }, 'もどる') : null,
    );
    if (mode.kind === 'target') {
      return h('div', { class: 'win cmdwin' }, head, h('p', { class: 'hint', style: 'padding:14px 0' }, `${mode.label}：光っている相手をタップ`));
    }
    if (mode.kind === 'skills' || mode.kind === 'items') {
      return h('div', { class: 'win sublist' }, head, h('div', { class: 'scroll' }, mode.kind === 'skills' ? skillButtons(u) : itemButtons()));
    }
    const extra = u.extraActions > 0;
    return h(
      'div',
      { class: 'win cmdwin' },
      head,
      h(
        'div',
        { class: 'cmds' },
        h('button', { class: 'menu-item sel', disabled: extra, onclick: () => pick('たたかう', 'enemy', [], (t) => ({ type: 'attack', target: t! })) }, 'たたかう', h('small', null, `MP+${battle.attackMpGain(u)}`)),
        h('button', { class: 'menu-item', onclick: () => ((mode = { kind: 'skills' }), render()) }, 'スキル'),
        h('button', { class: 'menu-item', disabled: extra, onclick: () => ((mode = { kind: 'items' }), render()) }, 'どうぐ'),
        h('button', { class: 'menu-item', onclick: () => submit({ type: 'defend' }) }, extra ? 'おわる' : 'ぼうぎょ'),
        h('button', { class: 'menu-item', disabled: extra, onclick: () => submit({ type: 'swap' }) }, 'いれかえ', h('small', null, `→${u.row === 'front' ? '後列' : '前列'}`)),
        h('button', { class: 'menu-item', disabled: true }, 'にげる'),
      ),
    );
  };

  const skillButtons = (u: Unit) => {
    const skills = u.char!.skills.map((n) => SKILL_BY_NAME.get(n)!);
    if (skills.length === 0) return h('p', { class: 'muted small' }, '技を覚えていない');
    return skills.map((s) => {
      const why = battle.cannotPay(u, s.cost, s.target) ?? (u.extraActions > 0 && s.effects.some((e) => e.kind === 'multiCast') ? '連続行動中は使えない' : null);
      const tk = battle.effectiveTarget(u, s.target, true);
      const cost = s.cost.kind === 'mp' ? `MP${battle.mpCost(u, s.cost, s.target)}` : s.cost.kind === 'hp' ? `HP${battle.hpCost(u, s.cost)}` : costLabel(s.cost);
      return h(
        'button',
        { class: `skill ${s.rare ? 'rare' : ''}`, disabled: !!why, onclick: () => pick(s.name, tk, s.effects, (t) => ({ type: 'skill', skill: s.name, target: t })) },
        h('span', { class: 'sk-name' }, `${s.name}${s.rare ? '★' : ''}`),
        h('span', { class: 'sk-meta' }, `${TARGET_LABEL[tk]}｜${cost}${why ? `｜${why}` : ''}`),
        h('span', { class: 'sk-text' }, s.text),
      );
    });
  };

  const itemButtons = () => {
    const names = [...new Set(run.inventory.filter((e) => e.kind === 'item').map((e) => e.name))];
    const usable = names.filter((n) => !ITEM_BY_NAME.get(n)!.effects.some((e) => e.kind === 'restAll' || e.kind === 'levelUp'));
    if (usable.length === 0) return h('p', { class: 'muted small' }, '戦闘で使えるアイテムがない');
    return usable.map((n) => {
      const it = ITEM_BY_NAME.get(n)!;
      const count = run.inventory.filter((e) => e.kind === 'item' && e.name === n).length;
      const escape = it.effects.some((e) => e.kind === 'escape');
      const why = escape && battle.kind !== 'normal' ? '強敵・ボスには使えない' : null;
      return h(
        'button',
        { class: 'skill', disabled: !!why, onclick: () => pick(n, it.target, it.effects, (t) => ({ type: 'item', item: n, target: t })) },
        h('span', { class: 'sk-name' }, `${n} ×${count}`),
        h('span', { class: 'sk-meta' }, `${TARGET_LABEL[it.target]}${why ? `｜${why}` : ''}`),
        h('span', { class: 'sk-text' }, it.text),
      );
    });
  };

  const pick = (label: string, target: TargetKind, effects: Effect[], make: (uid?: number) => Command) => {
    if (target === 'enemy' || target === 'ally') {
      mode = { kind: 'target', label, target, effects, make };
      infoUid = null;
      render();
    } else submit(make(undefined));
  };

  const submit = (cmd: Command) => {
    if (busy) return;
    try {
      battle.submit(cmd);
    } catch (e) {
      toast((e as Error).message);
      return;
    }
    mode = { kind: 'root' };
    loop();
  };

  let shown = 0;
  const loop = async () => {
    busy = true;
    render();
    while (battle.phase === 'running') {
      const fresh = battle.log.length > shown;
      shown = battle.log.length;
      await sleep(fresh ? 520 : 60);
      battle.advance();
      render();
    }
    shown = battle.log.length;
    busy = false;
    render();
  };

  const finish = () => {
    const result = battle.finish();
    if (battle.phase === 'lost') {
      run.result = 'dead';
      clearSave();
      app.go({ name: 'end' });
      return;
    }
    if (battle.phase === 'escaped') {
      app.save();
      app.go({ name: 'map' });
      return;
    }
    const rewards = battleRewards(run, battle.kind, result.exp, result.gold);
    run.log.kills += battle.units.filter((u) => u.side === 'enemy').length;
    if (screen.boss) bossCleared(run);
    if (run.result === 'clear') {
      clearSave();
      app.go({ name: 'end' });
      return;
    }
    app.save();
    app.go({ name: 'reward', title: screen.boss ? 'ボス撃破' : '勝利', rewards, boss: screen.boss });
  };

  loop();
  return root;
}

/** メッセージ窓：最新の2行 */
function messageWindow(battle: Battle) {
  const last = battle.log.slice(-2);
  return h(
    'div',
    { class: 'win msg' },
    last.map((l, i) =>
      h('p', { class: `${i < last.length - 1 ? 'old' : l.kind}` }, l.text, i === last.length - 1 && battle.phase === 'input' ? h('span', { class: 'cursor-blink' }, ' ▼') : null),
    ),
  );
}

/** 敵の情報：弱点・無効・特徴 */
function enemyInfo(battle: Battle, u: Unit) {
  const def = u.enemy!;
  const ALL: StatusId[] = ['poison', 'burn', 'confuse', 'stun'];
  const immune = u.phase2 && def.halfHp?.immuneAll ? ALL : (def.immune ?? []);
  const pills = (list: StatusId[], cls: string) =>
    list.length ? list.map((s) => h('span', { class: `pill ${cls}` }, STATUS_LABEL[s])) : [h('span', { class: 'pill none' }, 'なし')];
  const extra: string[] = [];
  if (def.counter) extra.push('物理攻撃に反撃');
  if (def.statusResist && def.statusResist < 1) extra.push('状態異常にかかりにくい');
  if (def.evasion) extra.push('回避が高い');
  return h(
    'div',
    { class: 'win foe-info' },
    h('div', { class: 'head' }, h('span', { class: 'name' }, def.name, def.kind !== 'normal' ? h('span', { class: 'k' }, def.kind === 'boss' ? '　ボス' : '　強敵') : null), h('span', { class: 'k' }, `HP ${u.hp}/${battle.maxHp(u)}`)),
    h('div', { class: 'row2' }, h('span', { class: 'k' }, '弱点'), pills(def.weak ?? [], 'weak'), h('span', { class: 'k' }, '無効'), pills(immune, 'immune'), extra.map((x) => h('span', { class: 'pill none' }, x))),
    h('div', { class: 'note' }, FEATURE.get(def.name) ?? ''),
  );
}

/** 「スライムA」の A を行動順に添える */
function letter(u: Unit) {
  const m = /([A-G])$/.exec(u.name);
  return m ? h('span', { class: 'letter' }, m[1]) : null;
}

const LINGER_LABEL: Record<string, string> = { taunt: '挑発', cover: 'かばう', counter: '反撃', evade: '回避↑', guard: '軽減', imbue: '付与', tick: '継続', ward: '防護', dodgeCounter: '見切り', defend: '防御' };

function statusBadges(u: Unit): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const k of Object.keys(u.status) as StatusId[]) {
    if (!u.status[k]) continue;
    const p = k === 'poison' && u.status.poison!.stacks > 1 ? `${u.status.poison!.stacks}` : '';
    out.push(h('span', { class: `badge ${k === 'poison' ? 'poison' : 'bad'}` }, `${STATUS_LABEL[k]}${p}`));
  }
  const sums = new Map<string, number>();
  for (const bf of u.buffs) sums.set(bf.stat, (sums.get(bf.stat) ?? 0) + bf.amount);
  for (const [s, v] of sums) {
    if (Math.abs(v) < 0.01) continue;
    out.push(h('span', { class: `badge ${v > 0 ? '' : 'bad'}` }, `${STAT_LABEL[s as keyof typeof STAT_LABEL]}${v > 0 ? '↑' : '↓'}`));
  }
  const seen = new Set<string>();
  for (const l of u.lingers) {
    if (seen.has(l.kind) || l.permanent) continue;
    seen.add(l.kind);
    out.push(h('span', { class: `badge ${l.sourceSide === u.side ? '' : 'bad'}` }, LINGER_LABEL[l.kind]));
  }
  if (u.charge) out.push(h('span', { class: 'badge' }, '溜め'));
  if (u.delayed) out.push(h('span', { class: 'badge charge' }, '溜め中'));
  return out;
}
