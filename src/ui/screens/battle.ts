// 戦闘画面。

import { ITEM_BY_NAME, SKILL_BY_NAME } from '../../data';
import { Battle, type Command, type Unit } from '../../engine/battle';
import { battleHooks, battleRewards, bossCleared, clearSave } from '../../engine/run';
import { STATUS_LABEL, STAT_LABEL, type Effect, type StatusId, type TargetKind } from '../../engine/types';
import type { App } from '../app';
import { bar, h, sleep, toast } from '../dom';
import { TARGET_LABEL, costLabel } from '../describe';

type Mode = { kind: 'root' } | { kind: 'skills' } | { kind: 'items' } | { kind: 'target'; label: string; target: 'enemy' | 'ally'; effects: Effect[]; make: (uid: number) => Command };

export function battleScreen(app: App, screen: { enemies: string[]; kind: 'normal' | 'elite' | 'boss'; boss: boolean }) {
  const run = app.run!;
  const battle = new Battle(run.party, screen.enemies, screen.kind, battleHooks(run));
  const root = h('div', { class: `screen battle ${screen.kind}` });
  let mode: Mode = { kind: 'root' };
  let shownLog = 0;
  const prevHp = new Map<number, number>();
  let busy = false;

  const render = () => {
    const order = battle.turnOrder(10);
    const newLogs = battle.log.slice(shownLog);
    shownLog = battle.log.length;
    const logs = battle.log.slice(-7);
    const targetable = new Set<number>();
    if (mode.kind === 'target' && battle.current) {
      for (const u of battle.selectableTargets(battle.current, mode.target, mode.effects)) targetable.add(u.uid);
    }
    const unitCard = (u: Unit) => {
      const hit = (prevHp.get(u.uid) ?? u.hp) > u.hp;
      const healed = (prevHp.get(u.uid) ?? u.hp) < u.hp;
      prevHp.set(u.uid, u.hp);
      const can = targetable.has(u.uid);
      const cls = ['unit', u.side, u.hp <= 0 ? 'dead' : '', battle.current === u ? 'acting' : '', can ? 'targetable' : '', hit ? 'hit' : '', healed ? 'healed' : ''].join(' ');
      return h(
        'div',
        {
          class: cls,
          onclick: can && mode.kind === 'target' ? () => submit((mode as Extract<Mode, { kind: 'target' }>).make(u.uid)) : undefined,
        },
        h('div', { class: 'unit-top' }, h('span', { class: 'unit-icon' }, u.icon), h('span', { class: 'unit-name' }, u.name), h('span', { class: 'row-tag' }, u.row === 'front' ? '前' : '後')),
        bar(u.hp, battle.maxHp(u), 'hp'),
        u.side === 'player' ? bar(u.mp, battle.maxMp(u), 'mp') : null,
        h('div', { class: 'badges' }, badges(u)),
      );
    };
    const enemies = battle.units.filter((u) => u.side === 'enemy');
    const players = battle.units.filter((u) => u.side === 'player');
    root.replaceChildren(
      h(
        'div',
        { class: 'turn-order' },
        h('span', { class: 'label' }, '行動順'),
        order.map((o, i) => h('span', { class: `order-chip ${o.unit.side} ${i === 0 ? 'now' : ''}`, title: o.unit.name }, o.unit.icon, letter(o.unit), o.charging ? h('b', { class: 'charge' }, '溜') : null)),
      ),
      h(
        'div',
        { class: 'field enemies' },
        h('div', { class: 'row-line' }, enemies.filter((u) => u.row === 'back').map(unitCard)),
        h('div', { class: 'row-line' }, enemies.filter((u) => u.row === 'front').map(unitCard)),
      ),
      h(
        'div',
        { class: 'log' },
        logs.map((l, i) => h('div', { class: `log-line ${l.kind} ${i >= logs.length - newLogs.length ? 'new' : ''}` }, l.text)),
      ),
      h(
        'div',
        { class: 'field players' },
        h('div', { class: 'row-line' }, players.filter((u) => u.row === 'front').map(unitCard)),
        h('div', { class: 'row-line back' }, players.filter((u) => u.row === 'back').map(unitCard)),
      ),
      commandPanel(),
    );
  };

  const commandPanel = () => {
    if (battle.phase === 'won' || battle.phase === 'lost' || battle.phase === 'escaped') return h('div', { class: 'commands' }, h('button', { class: 'primary big', onclick: finish }, 'つぎへ'));
    const u = battle.current;
    if (battle.phase !== 'input' || !u) return h('div', { class: 'commands waiting' }, '…');
    const back = h('button', { class: 'ghost', onclick: () => ((mode = { kind: 'root' }), render()) }, '← もどる');
    const head = h('div', { class: 'cmd-head' }, `${u.icon} ${u.name} の番${u.extraActions > 0 ? `（連続行動：あと${u.extraActions + 1}回）` : ''}`);
    if (mode.kind === 'target') {
      return h('div', { class: 'commands' }, head, h('p', { class: 'hint' }, `${mode.label}：対象を選んでください（光っているキャラをタップ）`), back);
    }
    if (mode.kind === 'skills') {
      const skills = u.char!.skills.map((n) => SKILL_BY_NAME.get(n)!);
      return h(
        'div',
        { class: 'commands' },
        head,
        h(
          'div',
          { class: 'skill-buttons' },
          skills.length === 0 ? h('p', { class: 'muted' }, '技を覚えていない') : null,
          skills.map((s) => {
            const why = battle.cannotPay(u, s.cost, s.target) ?? (u.extraActions > 0 && s.effects.some((e) => e.kind === 'multiCast') ? '連続行動中は使えない' : null);
            const tk = battle.effectiveTarget(u, s.target, true);
            const cost = s.cost.kind === 'mp' ? `MP${battle.mpCost(u, s.cost, s.target)}` : s.cost.kind === 'hp' ? `HP${battle.hpCost(u, s.cost)}` : costLabel(s.cost);
            return h(
              'button',
              { class: `skill-btn ${s.rare ? 'rare' : ''}`, disabled: !!why, onclick: () => pick(s.name, tk, s.effects, (t) => ({ type: 'skill', skill: s.name, target: t })) },
              h('span', { class: 'sk-name' }, `${s.name}${s.rare ? '★' : ''}`),
              h('span', { class: 'sk-meta' }, `${TARGET_LABEL[tk]}｜${cost}${why ? `｜${why}` : ''}`),
              h('span', { class: 'sk-text' }, s.text),
            );
          }),
        ),
        back,
      );
    }
    if (mode.kind === 'items') {
      const names = [...new Set(run.inventory.filter((e) => e.kind === 'item').map((e) => e.name))];
      const usable = names.filter((n) => !ITEM_BY_NAME.get(n)!.effects.some((e) => e.kind === 'restAll' || e.kind === 'levelUp'));
      return h(
        'div',
        { class: 'commands' },
        head,
        h(
          'div',
          { class: 'skill-buttons' },
          usable.length === 0 ? h('p', { class: 'muted' }, '戦闘で使えるアイテムがない') : null,
          usable.map((n) => {
            const it = ITEM_BY_NAME.get(n)!;
            const count = run.inventory.filter((e) => e.kind === 'item' && e.name === n).length;
            const escape = it.effects.some((e) => e.kind === 'escape');
            const why = escape && battle.kind !== 'normal' ? '強敵・ボスには使えない' : null;
            return h(
              'button',
              { class: 'skill-btn', disabled: !!why, onclick: () => pick(n, it.target, it.effects, (t) => ({ type: 'item', item: n, target: t })) },
              h('span', { class: 'sk-name' }, `${n} ×${count}`),
              h('span', { class: 'sk-meta' }, `${TARGET_LABEL[it.target]}${why ? `｜${why}` : ''}`),
              h('span', { class: 'sk-text' }, it.text),
            );
          }),
        ),
        back,
      );
    }
    const extra = u.extraActions > 0;
    return h(
      'div',
      { class: 'commands' },
      head,
      h(
        'div',
        { class: 'root-buttons' },
        h('button', { class: 'cmd', disabled: extra, onclick: () => pick('たたかう', 'enemy', [], (t) => ({ type: 'attack', target: t! })) }, '⚔️ たたかう'),
        h('button', { class: 'cmd', onclick: () => ((mode = { kind: 'skills' }), render()) }, '✨ スキル'),
        h('button', { class: 'cmd', disabled: extra, onclick: () => ((mode = { kind: 'items' }), render()) }, '🧪 どうぐ'),
        h('button', { class: 'cmd', onclick: () => submit({ type: 'defend' }) }, extra ? '⏹ 行動を終える' : '🛡️ ぼうぎょ'),
        h('button', { class: 'cmd', disabled: extra, onclick: () => submit({ type: 'swap' }) }, `🔁 いれかえ（→${u.row === 'front' ? '後列' : '前列'}）`),
      ),
    );
  };

  const pick = (label: string, target: TargetKind, effects: Effect[], make: (uid?: number) => Command) => {
    if (target === 'enemy' || target === 'ally') {
      mode = { kind: 'target', label, target, effects, make };
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

  const loop = async () => {
    busy = true;
    render();
    while (battle.phase === 'running') {
      await sleep(battle.log.length > shownLog ? 420 : 60);
      battle.advance();
      render();
    }
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
    app.save();
    app.go({ name: 'reward', title: screen.boss ? '👑 ボス撃破！' : '🏆 勝利！', rewards, boss: screen.boss });
  };

  loop();
  return root;
}

/** 「スライムA」の A を行動順に添える */
function letter(u: Unit) {
  const m = /([A-G])$/.exec(u.name);
  return m ? h('span', { class: 'tag-letter' }, m[1]) : null;
}

function badges(u: Unit): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const k of Object.keys(u.status) as StatusId[]) {
    if (!u.status[k]) continue;
    const p = k === 'poison' && u.status.poison!.stacks > 1 ? `×${u.status.poison!.stacks}` : '';
    out.push(h('span', { class: `badge bad ${k}` }, `${STATUS_LABEL[k]}${p}`));
  }
  const sums = new Map<string, number>();
  for (const bf of u.buffs) sums.set(bf.stat, (sums.get(bf.stat) ?? 0) + bf.amount);
  for (const [s, v] of sums) {
    if (Math.abs(v) < 0.01) continue;
    out.push(h('span', { class: `badge ${v > 0 ? 'good' : 'bad'}` }, `${STAT_LABEL[s as keyof typeof STAT_LABEL]}${v > 0 ? '↑' : '↓'}`));
  }
  const L: Record<string, string> = { taunt: '挑発', cover: 'かばう', counter: '反撃', evade: '回避↑', guard: '軽減', imbue: '付与', tick: '継続', ward: '防護', dodgeCounter: '見切り', defend: '防御' };
  const seen = new Set<string>();
  for (const l of u.lingers) {
    if (seen.has(l.kind)) continue;
    seen.add(l.kind);
    out.push(h('span', { class: `badge ${l.sourceSide === u.side ? 'good' : 'bad'}` }, L[l.kind]));
  }
  if (u.charge) out.push(h('span', { class: 'badge good' }, '溜め'));
  if (u.delayed) out.push(h('span', { class: 'badge charge' }, `溜め中：${u.delayed.name}`));
  return out;
}
