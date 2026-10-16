// バランス確認用：コンピューターが自動でランを遊ぶ。
// 賢くはないが「素直に遊んだらどのくらい勝てるか」の目安になる。

import { ITEM_BY_NAME, JOB_BY_NAME, SKILL_BY_NAME } from '../data';
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
  inventoryFull,
  removeFromInventory,
  forgetSkill,
  forgetPrice,
  addSkillSlot,
  buyPrice,
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

// ───────────────────────── 持ち物・技の整理（自動プレイ用の素朴な判断） ─────────────────────────

/** 技の価値のめやす：攻撃・回復・蘇生は高め、★レアはさらに高め、補助だけの技は低め */
function skillValue(name: string): number {
  const s = SKILL_BY_NAME.get(name)!;
  let v = s.rare ? 2 : 0;
  if (s.effects.some((e) => e.kind === 'damage' || e.kind === 'delayed' || e.kind === 'tick')) v += 2;
  if (s.effects.some((e) => e.kind === 'heal' || e.kind === 'revive')) v += 2.5;
  if (s.target === 'enemyAll' || s.target === 'allyAll') v += 0.5;
  return v + 1;
}

/** その装備が、だれかの今の装備より強いか */
function gearUpgradeFor(run: RunState, name: string) {
  const d = equipmentDef(name);
  return run.party.find((x) => {
    const cur = d.slot === 'weapon' ? x.weapon : x.armor;
    return JOB_BY_NAME.get(x.job)!.lineage === d.lineage && (!cur || equipmentDef(cur).tier < d.tier);
  });
}

/** その本を、だれが覚えると得か（覚えていない同じ職業の人） */
function bookReader(run: RunState, name: string) {
  const s = SKILL_BY_NAME.get(name)!;
  return run.party.find((x) => x.job === s.job && !x.skills.includes(name));
}

/** 持っていても使い道のない物か */
function useless(run: RunState, e: InvEntry): boolean {
  if (e.kind === 'book') return !bookReader(run, e.name);
  if (e.kind === 'equip') return !gearUpgradeFor(run, e.name);
  return false;
}

/** 手に入れた物をそれなりに使う */
function manage(run: RunState) {
  for (let i = run.inventory.length - 1; i >= 0; i--) {
    const e = run.inventory[i];
    if (e.kind === 'book') {
      const c = bookReader(run, e.name);
      if (c && c.skills.length < skillSlots(c)) learnBook(run, i, c.id);
    } else if (e.kind === 'equip') {
      const c = gearUpgradeFor(run, e.name);
      if (c) equip(run, i, c.id);
    } else if (e.kind === 'acc') {
      const c = run.party.find((x) => x.accessories[1] === null || (x.accessories[0] === null && !x.cursed));
      if (c) equip(run, i, c.id, c.accessories[0] === null && !c.cursed ? 0 : 1);
    }
  }
}

/** 持ち物がいっぱいなら、使い道のない物から捨てて空きを作る */
function makeRoom(run: RunState) {
  for (let i = run.inventory.length - 1; i >= 0 && inventoryFull(run); i--) {
    if (useless(run, run.inventory[i])) removeFromInventory(run, i);
  }
}

/**
 * 技の枠がいっぱいの人に、より良い本があれば、いちばん弱い技を忘れて入れ替える。
 * price：1回の値段（休憩所・イベントは 0）。limit：入れ替える最大回数。入れ替えた回数を返す
 */
function swapSkills(run: RunState, price: number, limit = 99): number {
  let n = 0;
  for (let i = run.inventory.length - 1; i >= 0 && n < limit; i--) {
    const e = run.inventory[i];
    if (e.kind !== 'book') continue;
    const c = bookReader(run, e.name);
    if (!c || c.skills.length < skillSlots(c)) continue;
    const worst = [...c.skills].sort((a, b) => skillValue(a) - skillValue(b))[0];
    if (skillValue(e.name) <= skillValue(worst) || run.gold < price) continue;
    forgetSkill(run, c.id, worst, price);
    learnBook(run, i, c.id);
    n++;
  }
  return n;
}

/** 報酬の選択肢から、いちばん役に立ちそうな物を1つ取る */
function takeBest(run: RunState, pick: RewardPick) {
  const score = (e: InvEntry) => {
    if (e.kind === 'book') return bookReader(run, e.name) ? skillValue(e.name) : 0;
    if (e.kind === 'equip') {
      if (!gearUpgradeFor(run, e.name)) return 0;
      return 3 + equipmentDef(e.name).tier * 0.3;
    }
    if (e.kind === 'acc') return run.party.some((x) => x.accessories.includes(null)) ? 2.5 : 1;
    return ITEM_BY_NAME.get(e.name)?.effects.some((x) => x.kind === 'heal' || x.kind === 'revive') ? 1.5 : 0.8;
  };
  const best = [...pick.options].sort((a, b) => score(b) - score(a))[0];
  if (!best || score(best) <= 0) return;
  makeRoom(run);
  addToInventory(run, best);
}

export interface SimResult {
  job: string;
  cleared: boolean;
  /** 倒れた（またはクリアした）層 */
  floor: number;
  level: number;
}

export function simulateRun(job: string, seed: number, ascension = 0): SimResult {
  const rng0 = new Rng(seed);
  const run = newRun(job, rng0.pick(starterBooks(job)), seed, ascension);
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
        // 休憩所では無料で技を入れ替えられる
        swapSkills(run, 0);
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
        // 強化になる装備 → 覚える人がいる本 → 回復薬 の順に、買えるだけ買う
        const want = (e: InvEntry) =>
          e.kind === 'equip' ? (gearUpgradeFor(run, e.name) ? 3 : 0) : e.kind === 'book' ? (bookReader(run, e.name) ? skillValue(e.name) / 2 : 0) : e.name === '薬草' || e.name === '回復薬' ? 1 : 0;
        const order = shop.goods.map((g, i) => ({ g, i })).filter((x) => !x.g.sold && want(x.g.entry) > 0).sort((a, b) => want(b.g.entry) - want(a.g.entry));
        for (const { g, i } of order) {
          if (run.gold < buyPrice(run, g.entry)) continue;
          makeRoom(run);
          buy(run, i);
          manage(run);
        }
        swapSkills(run, forgetPrice(run), 1);
        break;
      }
      case 'event': {
        const pick = pickEvent(run);
        const ok = pick.event.choices.map((_, i) => i).filter((i) => !choiceDisabled(run, pick, i));
        const out = resolveChoice(run, pick, ok.length > 0 ? rng.pick(ok) : pick.event.choices.length - 1);
        if (out.pick === 'forget') swapSkills(run, 0, 1);
        if (out.pick === 'slot') {
          const c = run.party.find((x) => run.inventory.some((e) => e.kind === 'book' && bookReader(run, e.name) === x)) ?? run.party[0];
          addSkillSlot(run, c.id);
        }
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
