// イベントを作るための部品。イベントの中身（src/data/events/）からはこれだけを使う。
// どの部品も、起きたことを説明する短い文章を返す。

import { ACCESSORIES, ITEMS, JOB_BY_NAME, SKILLS } from '../data';
import { EQUIPMENT } from '../data/equipment';
import { characterStats, gainExp, type Character } from './character';
import type { Rng } from './rng';
import { addToInventory, type InvEntry, type RunState } from './run';
import { STAT_LABEL, type Stat } from './types';

export interface EventCtx {
  run: RunState;
  /** イベントの主役（職業イベントは1人、ペアイベントは2人） */
  actors: Character[];
  rng: Rng;
}

export interface EventOutcome {
  text: string;
  /** 戦闘になる場合の敵 */
  battle?: string[];
  /** 結果のあとに、だれかを選んでもらう（forget＝技を1つ無料で忘れる／slot＝技の枠+1） */
  pick?: 'forget' | 'slot';
}

type Text = string | ((c: EventCtx) => string);

export interface EventChoice {
  label: Text;
  /** 選べない理由（選べるなら null） */
  disabled?: (c: EventCtx) => string | null;
  resolve: (c: EventCtx) => EventOutcome;
}

export interface GameEvent {
  id: string;
  title: Text;
  icon: string;
  /** general＝いつでも／job＝その職業がいると／pair＝その2職業がそろうと／floor＝その層だけ */
  kind: 'general' | 'job' | 'pair' | 'floor';
  /** job・pair で必要な職業 */
  jobs?: string[];
  /** 起きる層（省略するとどの層でも） */
  floors?: number[];
  text: Text;
  choices: EventChoice[];
}

export const textOf = (t: Text, c: EventCtx) => (typeof t === 'function' ? t(c) : t);

/** 文章中でのキャラの呼び方 */
export const who = (c: Character) => (c.isHero ? `主人公（${c.job}）` : c.name);

export const alive = (run: RunState) => run.party.filter((c) => c.hp > 0);

// ───────────────────────── HP・MP ─────────────────────────

export function healAll(run: RunState, ratio: number): string {
  for (const c of alive(run)) {
    const st = characterStats(c);
    c.hp = Math.min(st.hp, c.hp + Math.round(st.hp * ratio));
  }
  return `全員のHPが回復した。`;
}

export function healOne(c: Character, ratio: number): string {
  if (c.hp <= 0) return '';
  const st = characterStats(c);
  c.hp = Math.min(st.hp, c.hp + Math.round(st.hp * ratio));
  return `${who(c)}のHPが回復した。`;
}

export function mpAll(run: RunState, ratio: number): string {
  for (const c of alive(run)) {
    const st = characterStats(c);
    c.mp = Math.min(st.mp, c.mp + Math.round(st.mp * ratio));
  }
  return `全員のMPが回復した。`;
}

export function reviveAll(run: RunState, ratio: number): string {
  const down = run.party.filter((c) => c.hp <= 0);
  for (const c of down) c.hp = Math.max(1, Math.round(characterStats(c).hp * ratio));
  return down.length > 0 ? '倒れていた仲間が起き上がった！' : '';
}

/** HPを割合で減らす（倒れはしない） */
export function hurtAll(run: RunState, ratio: number): string {
  for (const c of alive(run)) c.hp = Math.max(1, c.hp - Math.round(characterStats(c).hp * ratio));
  return '全員が少しダメージを受けた。';
}

export function hurtOne(c: Character, ratio: number): string {
  if (c.hp <= 0) return '';
  c.hp = Math.max(1, c.hp - Math.round(characterStats(c).hp * ratio));
  return `${who(c)}はダメージを受けた。`;
}

/** 今のHPが最大HPの ratio 以下なら選べない */
export const needHp = (c: Character, ratio: number) => (c.hp <= characterStats(c).hp * ratio ? `${who(c)}のHPが足りない` : null);

// ───────────────────────── お金・持ち物 ─────────────────────────

export function gainGold(run: RunState, n: number): string {
  run.gold += n;
  return `${n}G を手に入れた！`;
}

export function payGold(run: RunState, n: number): string {
  run.gold = Math.max(0, run.gold - n);
  return `${n}G を払った。`;
}

export const needGold = (run: RunState, n: number) => (run.gold < n ? 'お金が足りない' : null);

function give(run: RunState, e: InvEntry, label: string): string {
  return addToInventory(run, e) ? `${label}「${e.name}」を手に入れた！` : `${label}「${e.name}」を見つけたが、持ちきれなかった……`;
}

export function giveItem(run: RunState, rng: Rng, opts: { name?: string; rare?: boolean } = {}): string {
  const name = opts.name ?? rng.pick(ITEMS.filter((i) => i.rare === !!opts.rare && !i.effects.some((x) => x.kind === 'levelUp'))).name;
  return give(run, { kind: 'item', name }, 'アイテム');
}

export function giveBook(run: RunState, rng: Rng, opts: { job?: string; rare?: boolean; archetype?: string } = {}): string {
  const pool = SKILLS.filter(
    (s) => (!opts.job || s.job === opts.job) && (opts.rare === undefined || s.rare === opts.rare) && (!opts.archetype || s.archetype === opts.archetype),
  );
  return give(run, { kind: 'book', name: rng.pick(pool).name }, 'スキルブック');
}

export function giveAccessory(run: RunState, rng: Rng, opts: { name?: string; rareChance?: number } = {}): string {
  const name = opts.name ?? rng.pick(ACCESSORIES.filter((a) => a.rare === rng.chance(opts.rareChance ?? 0.15))).name;
  return give(run, { kind: 'acc', name }, 'アクセサリー');
}

/** そのキャラが装備できる、層に合った武器か防具 */
export function giveGear(run: RunState, rng: Rng, c: Character, tierBonus = 1): string {
  const lineage = JOB_BY_NAME.get(c.job)!.lineage;
  const tier = Math.min(3, run.floor - 1 + tierBonus);
  const pool = EQUIPMENT.filter((e) => e.lineage === lineage && e.tier === tier);
  return give(run, { kind: 'equip', name: rng.pick(pool).name }, '装備');
}

// ───────────────────────── 成長 ─────────────────────────

export function expAll(run: RunState, exp: number): string {
  const ups: string[] = [];
  for (const c of alive(run)) if (gainExp(c, exp) > 0) ups.push(`${who(c)}はLv${c.level}になった！`);
  return [`全員が ${exp} の経験値を得た。`, ...ups].join(' ');
}

/** 層に合わせた経験値の量 */
export const floorExp = (run: RunState, base = 10) => base * run.floor * run.floor + base;

/** 能力値を永久に上げる */
export function boost(c: Character, stats: Partial<Record<Stat, number>>): string {
  c.bonus = { ...(c.bonus ?? {}) };
  const parts: string[] = [];
  for (const [k, v] of Object.entries(stats) as [Stat, number][]) {
    c.bonus[k] = (c.bonus[k] ?? 0) + v;
    if (k === 'hp' && c.hp > 0) c.hp += v;
    if (k === 'mp') c.mp += v;
    parts.push(`${STAT_LABEL[k]}${v >= 0 ? '+' : ''}${v}`);
  }
  return `${who(c)}の${parts.join('・')}（ずっと続く）`;
}

/** 層が進むほど大きくなる永続強化の量 */
export const boostSize = (run: RunState) => 1 + run.floor;

export const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
