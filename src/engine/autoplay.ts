// バランス確認用：コンピューターが自動でランを遊ぶ。
// 賢くはないが「素直に遊んだらどのくらい勝てるか」の目安になる。

import { ITEM_BY_NAME, SKILL_BY_NAME } from '../data';
import { Battle, type Command, type Unit } from './battle';
import { characterStats, skillSlots } from './character';
import { choiceDisabled, pickEvent, resolveChoice } from './events';
import {
  addToInventory,
  battleHooks,
  battleRewards,
  bossCleared,
  chooseBlessing,
  choosePartner,
  choices,
  encounterFor,
  equip,
  equipmentDef,
  learnBook,
  moveTo,
  newRun,
  openShop,
  buy,
  recruit,
  rest,
  train,
  starterBooks,
  treasure,
  isPartyDead,
  type InvEntry,
  type RewardPick,
  type RunState,
} from './run';
import type { BattleKind } from './battle';
import { Rng } from './rng';

export function chooseCommand(b: Battle, u: Unit, rng: Rng, items: string[] = []): Command {
  const foes = b.alive('enemy');
  const allies = b.alive('player');
  const c = u.char!;
  const usable = c.skills
    .map((n) => SKILL_BY_NAME.get(n)!)
    .filter((s) => !b.cannotPay(u, s.cost, s.target))
    .filter((s) => !(u.extraActions > 0 && s.effects.some((e) => e.kind === 'multiCast')));
  const target = (kind: string, effects: Parameters<Battle['selectableTargets']>[2]) => {
    const list = b.selectableTargets(u, kind as 'enemy' | 'ally', effects);
    if (kind === 'ally') return [...list].sort((x, y) => x.hp / b.maxHp(x) - y.hp / b.maxHp(y))[0]?.uid;
    return [...list].sort((x, y) => x.hp - y.hp)[0]?.uid;
  };
  // 仲間が倒れていたら蘇生
  const dead = b.units.filter((x) => x.side === 'player' && x.hp <= 0);
  if (dead.length > 0) {
    const rev = usable.find((s) => s.effects.some((e) => e.kind === 'revive'));
    if (rev) return { type: 'skill', skill: rev.name, target: target(rev.target, rev.effects) };
  }
  // 回復
  const low = allies.find((x) => x.hp < b.maxHp(x) * 0.4);
  if (low) {
    const heal = usable.find((s) => s.effects.some((e) => e.kind === 'heal') && s.target !== 'enemy');
    if (heal) return { type: 'skill', skill: heal.name, target: heal.target === 'ally' ? low.uid : undefined };
    const herb = items.find((n) => ITEM_BY_NAME.get(n)?.effects.some((e) => e.kind === 'heal'));
    if (herb) return { type: 'item', item: herb, target: ITEM_BY_NAME.get(herb)!.target === 'ally' ? low.uid : undefined };
  }
  // 攻撃技（敵が多いなら全体技を優先）
  const attacks = usable.filter((s) => s.effects.some((e) => e.kind === 'damage' || e.kind === 'delayed' || e.kind === 'tick' || e.kind === 'status'));
  const aoe = attacks.filter((s) => s.target !== 'enemy');
  const pool = foes.length >= 3 && aoe.length > 0 ? aoe : attacks;
  const support = usable.filter((s) => !attacks.includes(s));
  if (support.length > 0 && rng.chance(0.25)) {
    const s = rng.pick(support);
    return { type: 'skill', skill: s.name, target: s.target === 'enemy' || s.target === 'ally' ? target(s.target, s.effects) : undefined };
  }
  if (pool.length > 0 && rng.chance(0.75)) {
    const s = rng.pick(pool);
    return { type: 'skill', skill: s.name, target: s.target === 'enemy' || s.target === 'ally' ? target(s.target, s.effects) : undefined };
  }
  return { type: 'attack', target: target('enemy', [])! };
}

export function runBattle(run: RunState, enemies: string[], kind: BattleKind, rng: Rng, variants: (string | null)[] = []): Battle {
  const b = new Battle(run.party, enemies, kind, battleHooks(run, rng), variants);
  let guard = 0;
  while (guard++ < 2000) {
    const ph = b.advance();
    if (ph === 'input') {
      const items = run.inventory.filter((e) => e.kind === 'item').map((e) => e.name);
      const cmd = chooseCommand(b, b.current!, rng, items);
      try {
        b.submit(cmd);
      } catch {
        b.submit({ type: 'defend' });
      }
    } else if (ph !== 'running') break;
  }
  return b;
}

/** 手に入れた物をそれなりに使う */
function manage(run: RunState) {
  for (let i = run.inventory.length - 1; i >= 0; i--) {
    const e = run.inventory[i];
    if (e.kind === 'book') {
      const c = run.party.find((x) => x.job === SKILL_BY_NAME.get(e.name)!.job && !x.skills.includes(e.name));
      if (c && c.skills.length < skillSlots(c)) learnBook(run, i, c.id);
    } else if (e.kind === 'equip') {
      const d = equipmentDef(e.name);
      const c = run.party.find((x) => {
        const cur = d.slot === 'weapon' ? x.weapon : x.armor;
        return cur && equipmentDef(cur).lineage === d.lineage && equipmentDef(cur).tier < d.tier;
      });
      if (c) equip(run, i, c.id);
    } else if (e.kind === 'acc') {
      const c = run.party.find((x) => x.accessories.includes(null));
      if (c) equip(run, i, c.id, c.accessories[0] === null ? 0 : 1);
    }
  }
}

/** 報酬の選択肢から、それなりに良さそうな物を1つ取る */
function takeBest(run: RunState, pick: RewardPick) {
  const jobs = run.party.map((c) => c.job);
  const score = (e: InvEntry) => {
    if (e.kind === 'book') return jobs.includes(SKILL_BY_NAME.get(e.name)!.job) ? 3 : 0;
    if (e.kind === 'acc') return 2;
    if (e.kind === 'equip') return 1.5;
    return 1;
  };
  const best = [...pick.options].sort((a, b) => score(b) - score(a))[0];
  if (best) addToInventory(run, best);
}

export interface SimResult {
  job: string;
  cleared: boolean;
  /** 倒れた（またはクリアした）層 */
  floor: number;
  level: number;
}

export function simulateRun(job: string, seed: number): SimResult {
  const rng0 = new Rng(seed);
  const run = newRun(job, rng0.pick(starterBooks(job)), seed);
  const rng = new Rng(seed + 1);
  choosePartner(run, rng.int(0, 2));
  return playRun(run, rng);
}

/** ランを自動で進める。lastFloor を指定すると、その層を抜けた時点で止める */
export function playRun(run: RunState, rng: Rng, lastFloor = 99): SimResult {
  const job = run.party[0].job;
  const dead = () => ({ job, cleared: false, floor: run.floor, level: run.party[0].level });
  let steps = 0;
  while (!run.result && run.floor <= lastFloor && steps++ < 200) {
    const opts = choices(run);
    if (opts.length === 0) break;
    const living = run.party.filter((c) => c.hp > 0);
    const hpRatio = living.reduce((a, c) => a + c.hp / characterStats(c).hp, 0) / run.party.length;
    const pref = (t: string) =>
      t === 'rest' ? (hpRatio < 0.6 ? 0 : 5) : t === 'battle' ? 1 : t === 'treasure' ? 0 : t === 'event' ? 2 : t === 'shop' ? 3 : t === 'elite' ? (hpRatio > 0.8 ? 2 : 6) : 0;
    const node = [...opts].sort((a, b) => pref(a.type) - pref(b.type))[0];
    moveTo(run, node.id);
    switch (node.type) {
      case 'battle':
      case 'elite':
      case 'boss': {
        const enc = encounterFor(run, node);
        const b = runBattle(run, enc.enemies, enc.kind, rng, enc.variants);
        const r = b.finish();
        if (b.phase === 'lost' || isPartyDead(run)) return dead();
        const rw = battleRewards(run, enc.kind, r.exp, r.gold);
        for (const p of rw.picks) takeBest(run, p);
        if (node.type === 'boss') {
          bossCleared(run);
          if (run.blessingChoices) chooseBlessing(run, rng.pick(run.blessingChoices));
          else if (!run.result) recruit(run, rng.int(0, 2));
        }
        break;
      }
      case 'rest': {
        // 元気なら鍛える（いちばん能力の高い攻撃手段を伸ばす）、弱っていたら休む
        if (hpRatio > 0.8) {
          const c = rng.pick(run.party.filter((x) => x.hp > 0));
          const st = characterStats(c);
          train(run, c.id, st.mag > st.atk ? 'mag' : 'atk');
        } else rest(run);
        break;
      }
      case 'treasure':
        for (const p of treasure(run).picks) takeBest(run, p);
        break;
      case 'shop': {
        const shop = openShop(run);
        const jobs = run.party.map((c) => c.job);
        shop.goods.forEach((g, i) => {
          if (g.entry.kind === 'book' && jobs.includes(SKILL_BY_NAME.get(g.entry.name)!.job)) buy(run, i);
          if (g.entry.name === '薬草' || g.entry.name === '回復薬') buy(run, i);
        });
        break;
      }
      case 'event': {
        const pick = pickEvent(run);
        const ok = pick.event.choices.map((_, i) => i).filter((i) => !choiceDisabled(run, pick, i));
        const out = resolveChoice(run, pick, ok.length > 0 ? rng.pick(ok) : pick.event.choices.length - 1);
        if (out.battle) {
          const b = runBattle(run, out.battle, 'normal', rng);
          const r = b.finish();
          if (b.phase === 'lost') return dead();
          battleRewards(run, 'normal', r.exp, r.gold);
        }
        break;
      }
    }
    manage(run);
  }
  return { job, cleared: run.result === 'clear', floor: run.floor, level: run.party[0].level };
}
