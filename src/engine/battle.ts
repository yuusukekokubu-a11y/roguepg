// 戦闘システム。
// ・素早さ順に1人ずつ行動する個別ターン型（行動するたびに「待ち時間」が 1000÷素早さ 増える）
// ・前列／後列の2列
// ・技・アイテムはすべて「部品」（Effect）の組み合わせを順番に処理する

import { ITEMS, JOB_BY_NAME, SKILL_BY_NAME, ITEM_BY_NAME, type SkillDef } from '../data';
import type { AccessoryMod, AccCondition } from '../data/accessoryMods';
import { ENEMY_BY_NAME, type EnemyAction, type EnemyDef } from '../data/enemies';
import { VARIANT_BY_ID, VARIANT_REWARD, type VariantDef } from '../data/variants';
import { BALANCE } from './balance';
import { characterMods, characterStats, type Character, type Stats } from './character';
import { parseAction } from './parser';
import type { Rng } from './rng';
import { STATUS_LABEL, STAT_LABEL, type Condition, type Cost, type Effect, type Stat, type StatusId, type TargetKind } from './types';

export type Side = 'player' | 'enemy';

export interface Buff {
  stat: Stat;
  amount: number;
  turns: number;
}

/** 場に残る効果（数ターン続くもの） */
export interface Linger {
  kind: 'taunt' | 'cover' | 'counter' | 'evade' | 'guard' | 'imbue' | 'tick' | 'ward' | 'dodgeCounter' | 'defend';
  turns: number;
  sourceSide: Side;
  coverTarget?: number;
  status?: StatusId;
  amount?: number;
  what?: 'lifesteal' | 'poison' | 'magic';
  tick?: { effects: Effect[]; caster: Unit; randomEnemy: boolean };
  permanent?: boolean;
  /** 物理攻撃にだけ反応する（反撃） */
  physicalOnly?: boolean;
}

export interface StatusState {
  poison?: { stacks: number; turns: number; mul: number; weak: boolean };
  burn?: { turns: number; weak: boolean };
  confuse?: { turns: number };
  stun?: boolean;
}

export interface Unit {
  uid: number;
  side: Side;
  name: string;
  icon: string;
  char?: Character;
  enemy?: EnemyDef;
  base: Stats;
  hp: number;
  mp: number;
  row: 'front' | 'back';
  buffs: Buff[];
  status: StatusState;
  lingers: Linger[];
  charge?: { mul: number; crit: boolean; scope: 'attack' | 'magic' | 'any' };
  /** 残響：次の魔法が追加で発動する回数 */
  echo?: number;
  delayed?: { name: string; effects: Effect[]; conditions: Condition[]; target: TargetKind; targetUid?: number; powerMul: number };
  wait: number;
  mods: AccessoryMod[];
  ranged: boolean;
  extraActions: number;
  pendingHaste: number;
  turnsTaken: number;
  lastAttackerUid?: number;
  endureUsed: boolean;
  enrageUsed: boolean;
  patternIndex: number;
  /** 変異個体の性質 */
  variant?: VariantDef;
  /** 敵の次の行動（予告） */
  intent?: { action: EnemyAction; effects: Effect[]; conditions: Condition[]; targetUid?: number };
  /** HPが半分以下になって行動が変わった（第2段階） */
  phase2: boolean;
  stolenGold: number;
  stolenFrom: boolean;
}

export type Command =
  | { type: 'attack'; target: number }
  | { type: 'skill'; skill: string; target?: number }
  | { type: 'item'; item: string; target?: number }
  | { type: 'defend' }
  | { type: 'swap' };

export interface LogEntry {
  text: string;
  kind: 'info' | 'damage' | 'heal' | 'status' | 'turn' | 'system';
  /** 行動したユニット（演出用） */
  actor?: number;
  /** 行動の名前（演出用。「たたかう」などは出さない） */
  action?: string;
  /** 攻撃をかわしたユニット（演出用） */
  miss?: number;
}

export interface BattleHooks {
  rng: Rng;
  getGold(): number;
  addGold(n: number): void;
  addItem(name: string): boolean;
  removeItem(name: string): void;
  /** 身代わり人形が壊れたとき */
  breakAccessory(c: Character, name: string): void;
  /** パーティー全員にかかる加護 */
  blessings?: AccessoryMod[];
}

export type BattleKind = 'normal' | 'elite' | 'boss';
export type Phase = 'running' | 'input' | 'won' | 'lost' | 'escaped';

interface ActionSpec {
  name: string;
  effects: Effect[];
  conditions: Condition[];
  target: TargetKind;
  cost?: Cost;
  isItem?: boolean;
  isAttack?: boolean;
  isCounter?: boolean;
  isSkill?: boolean;
  powerMul?: number;
  counterStatus?: StatusId;
  /** 残響で追加発動するとき：MPなどを払わない */
  noCost?: boolean;
}

interface ActionCtx {
  spec: ActionSpec;
  powerMul: number;
  hitUnits: Set<Unit>;
  dealtDamage: boolean;
  crit: boolean;
  /** 対象変更アクセサリーで「ランダム2回」になったとき */
  random2: boolean;
  /** 対象を変えるアクセサリーで決まった実際の対象 */
  target: TargetKind;
}

const NORMAL_ATTACK: Effect = { kind: 'damage', type: 'physical', size: 'medium', hits: [1, 1], power: 1.0 };

let uidSeq = 1;

export class Battle {
  units: Unit[] = [];
  log: LogEntry[] = [];
  phase: Phase = 'running';
  current: Unit | null = null;
  now = 0;
  rewardMul = 1;
  readonly rng: Rng;

  constructor(
    party: Character[],
    enemyNames: string[],
    readonly kind: BattleKind,
    readonly hooks: BattleHooks,
    /** 変異個体（enemyNames と同じ並び。null は普通の個体） */
    variants: (string | null)[] = [],
  ) {
    this.rng = hooks.rng;
    for (const c of party) this.units.push(this.makePlayerUnit(c));
    const counts = new Map<string, number>();
    enemyNames.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
    const seen = new Map<string, number>();
    enemyNames.forEach((n, i) => {
      const def = ENEMY_BY_NAME.get(n);
      if (!def) throw new Error(`敵「${n}」がいません`);
      const idx = (seen.get(n) ?? 0) + 1;
      seen.set(n, idx);
      const label = counts.get(n)! > 1 ? `${n}${'ABCDEFG'[idx - 1]}` : n;
      const v = variants[i] ? VARIANT_BY_ID.get(variants[i]!) : undefined;
      this.units.push(this.makeEnemyUnit(def, label, v));
    });
    for (const u of this.units) {
      u.wait = (BALANCE.timeBase / this.spd(u)) * (0.3 + this.rng.next() * 0.7);
      if (u.mods.some((m) => m.battleStartFastest)) u.wait = 0;
      if (u.mods.some((m) => m.alwaysTaunt)) u.lingers.push({ kind: 'taunt', turns: 99, sourceSide: u.side, permanent: true });
      for (const m of u.mods) if (m.alwaysStatus === 'poison') u.status.poison = { stacks: 1, turns: 99, mul: 1, weak: false };
      if (u.side === 'enemy') this.planIntent(u);
      const ec = u.enemy?.counter;
      if (ec) u.lingers.push({ kind: 'counter', turns: 99, sourceSide: u.side, permanent: true, physicalOnly: true, status: ec.status });
    }
    this.fixRows();
    const names = [...counts.entries()].map(([n, c]) => (c > 1 ? `${n}×${c}` : n)).join('、');
    this.push(`${names} があらわれた！`, 'system');
  }

  // ───────────────────────── ユニット作成 ─────────────────────────

  /** アクセサリー＋加護 */
  private playerMods(c: Character): AccessoryMod[] {
    return [...characterMods(c), ...(this.hooks.blessings ?? [])];
  }

  private makePlayerUnit(c: Character): Unit {
    const st = characterStats(c);
    // 加護のステータス倍率（アクセサリーの分は characterStats に入っている）
    for (const m of this.hooks.blessings ?? []) {
      for (const [k, v] of Object.entries(m.statMul ?? {})) st[k as Stat] = Math.max(1, Math.round(st[k as Stat] * v));
    }
    const job = JOB_BY_NAME.get(c.job)!;
    return {
      ...this.blankUnit(),
      side: 'player',
      name: c.name,
      icon: job.icon,
      char: c,
      base: st,
      hp: c.hp,
      mp: c.mp,
      row: c.row,
      mods: this.playerMods(c),
      ranged: job.ranged,
    };
  }

  private makeEnemyUnit(def: EnemyDef, label: string, variant?: VariantDef): Unit {
    const fl = BALANCE.enemyScale[def.floor] ?? { hp: 1, atk: 1 };
    const bs = def.kind === 'boss' && def.floor >= 2 ? BALANCE.bossScale : { hp: 1, atk: 1 };
    const sc = { hp: fl.hp * bs.hp, atk: fl.atk * bs.atk };
    const base: Stats = { hp: Math.round(def.hp * sc.hp), mp: 99, atk: Math.round(def.atk * sc.atk), def: def.def, mag: Math.round(def.mag * sc.atk), spr: def.spr, spd: def.spd };
    for (const [k, v] of Object.entries(variant?.stats ?? {})) base[k as Stat] = Math.max(1, Math.round(base[k as Stat] * v));
    return {
      ...this.blankUnit(),
      side: 'enemy',
      name: variant ? `${variant.prefix}${label}` : label,
      icon: def.icon,
      enemy: def,
      variant,
      base,
      hp: base.hp,
      mp: 99,
      row: def.back ? 'back' : 'front',
      mods: variant?.mod ? [variant.mod] : [],
    };
  }

  private blankUnit(): Unit {
    return {
      uid: uidSeq++,
      side: 'player',
      name: '',
      icon: '',
      base: { hp: 1, mp: 0, atk: 0, def: 0, mag: 0, spr: 0, spd: 1 },
      hp: 1,
      mp: 0,
      row: 'front',
      buffs: [],
      status: {},
      lingers: [],
      wait: 0,
      mods: [],
      ranged: false,
      extraActions: 0,
      pendingHaste: 0,
      turnsTaken: 0,
      endureUsed: false,
      enrageUsed: false,
      patternIndex: 0,
      phase2: false,
      stolenGold: 0,
      stolenFrom: false,
    };
  }

  // ───────────────────────── 便利関数 ─────────────────────────

  private push(text: string, kind: LogEntry['kind'] = 'info', fx: Pick<LogEntry, 'actor' | 'action' | 'miss'> = {}) {
    this.log.push({ text, kind, ...fx });
  }

  alive(side?: Side): Unit[] {
    return this.units.filter((u) => u.hp > 0 && (!side || u.side === side));
  }

  opposite(side: Side): Side {
    return side === 'player' ? 'enemy' : 'player';
  }

  maxHp(u: Unit) {
    return u.base.hp;
  }
  maxMp(u: Unit) {
    return u.base.mp;
  }

  private condOk(u: Unit, cond: AccCondition): boolean {
    switch (cond) {
      case 'hpLowThird':
        return u.hp <= this.maxHp(u) / 3;
      case 'hpFull':
        return u.hp >= this.maxHp(u);
      case 'statused':
        return this.statusCount(u) > 0;
      case 'front':
        return u.row === 'front';
      case 'back':
        return u.row === 'back';
      case 'solo':
        return this.alive(u.side).length === 1;
      case 'allyDown':
        return this.units.some((x) => x.side === u.side && x.hp <= 0);
    }
  }

  /** 強化・弱体・アクセサリー込みのステータス */
  stat(u: Unit, s: Stat): number {
    let mul = 1 + u.buffs.filter((b) => b.stat === s).reduce((a, b) => a + b.amount, 0);
    mul = Math.min(BALANCE.buffCap.max, Math.max(BALANCE.buffCap.min, mul));
    let v = u.base[s] * mul;
    if (s === 'atk' && u.status.burn) v *= 1 - BALANCE.status.burnAtkDown;
    for (const m of u.mods) for (const c of m.statMulIf ?? []) if (this.condOk(u, c.cond)) v *= c.stats[s] ?? 1;
    return Math.max(1, v);
  }

  spd(u: Unit) {
    return this.stat(u, 'spd');
  }

  statusCount(u: Unit): number {
    return (Object.keys(u.status) as (keyof StatusState)[]).filter((k) => u.status[k]).length;
  }

  private debuffCount(u: Unit): number {
    return u.buffs.filter((b) => b.amount < 0).length;
  }

  private hasLinger(u: Unit, kind: Linger['kind']) {
    return u.lingers.some((l) => l.kind === kind);
  }

  // ───────────────────────── 行動順 ─────────────────────────

  /** 今後の行動順（画面表示用） */
  turnOrder(n = 8): { unit: Unit; charging: boolean }[] {
    const sim = this.alive().map((u) => ({ u, w: u.wait }));
    const out: { unit: Unit; charging: boolean }[] = [];
    if (this.current && this.current.hp > 0) {
      out.push({ unit: this.current, charging: !!this.current.delayed });
      const me = sim.find((s) => s.u === this.current);
      if (me) me.w = this.now + BALANCE.timeBase / this.spd(me.u);
    }
    const chargingShown = new Set<Unit>();
    while (out.length < n && sim.length > 0) {
      sim.sort((a, b) => a.w - b.w || this.tieBreak(a.u, b.u));
      const s = sim[0];
      const charging = !!s.u.delayed && !chargingShown.has(s.u);
      chargingShown.add(s.u);
      out.push({ unit: s.u, charging });
      s.w += BALANCE.timeBase / this.spd(s.u);
    }
    return out;
  }

  private tieBreak(a: Unit, b: Unit) {
    if (a.side !== b.side) return a.side === 'player' ? -1 : 1;
    return a.uid - b.uid;
  }

  // ───────────────────────── 進行 ─────────────────────────

  /** 次の1手を進める。プレイヤーの入力待ちなら 'input' */
  advance(): Phase {
    if (this.phase !== 'running') return this.phase;
    const alive = this.alive();
    alive.sort((a, b) => a.wait - b.wait || this.tieBreak(a, b));
    const u = alive[0];
    this.now = Math.max(this.now, u.wait);
    this.startTurn(u);
    if (this.checkEnd()) return this.phase;
    if (u.hp <= 0) return this.phase;

    if (u.status.stun) {
      delete u.status.stun;
      this.push(`${u.name} はスタンして動けない！`, 'status');
      this.endTurn(u);
      return this.phase;
    }
    if (u.delayed) {
      const d = u.delayed;
      u.delayed = undefined;
      this.push(`${u.name} の ${d.name}！`, 'turn', { actor: u.uid, action: d.name });
      this.execute(u, { name: d.name, effects: d.effects, conditions: d.conditions, target: d.target, powerMul: d.powerMul }, d.targetUid);
      this.endTurn(u);
      this.checkEnd();
      return this.phase;
    }
    if (u.status.confuse) {
      this.confusedAction(u);
      this.endTurn(u);
      this.checkEnd();
      return this.phase;
    }
    if (u.side === 'enemy') {
      this.enemyAct(u);
      if (u.phase2 && u.enemy?.halfHp?.doubleAction && u.hp > 0 && !this.checkEnd() && !u.status.stun) {
        this.enemyAct(u);
      }
      this.endTurn(u);
      this.checkEnd();
      return this.phase;
    }
    if (u.mods.some((m) => m.attackOnly)) {
      const t = this.rng.pick(this.selectableTargets(u, 'enemy', [NORMAL_ATTACK]));
      this.push(`${u.name} は暴れている！`, 'turn', { actor: u.uid });
      this.execute(u, { name: 'たたかう', effects: [NORMAL_ATTACK], conditions: [], target: 'enemy', isAttack: true }, t.uid);
      this.endTurn(u);
      this.checkEnd();
      return this.phase;
    }
    this.current = u;
    this.phase = 'input';
    return this.phase;
  }

  /** プレイヤーのコマンドを実行する */
  submit(cmd: Command): Phase {
    const u = this.current;
    if (!u || this.phase !== 'input') throw new Error('入力待ちではありません');
    const err = this.validate(u, cmd);
    if (err) throw new Error(err);
    this.phase = 'running';
    switch (cmd.type) {
      case 'attack':
        this.push(`${u.name} の攻撃！`, 'turn', { actor: u.uid });
        this.execute(u, { name: 'たたかう', effects: [NORMAL_ATTACK], conditions: [], target: 'enemy', isAttack: true }, cmd.target);
        break;
      case 'defend':
        u.extraActions = 0;
        this.push(`${u.name} は身を守っている。`, 'turn', { actor: u.uid, action: 'ぼうぎょ' });
        u.lingers.push({ kind: 'defend', turns: 1, sourceSide: u.side });
        break;
      case 'swap':
        u.row = u.row === 'front' ? 'back' : 'front';
        this.push(`${u.name} は${u.row === 'front' ? '前列' : '後列'}に移動した。`, 'turn', { actor: u.uid });
        this.fixRows();
        break;
      case 'skill': {
        const s = SKILL_BY_NAME.get(cmd.skill)!;
        this.push(`${u.name} の ${s.name}！`, 'turn', { actor: u.uid, action: s.name });
        const spec = skillSpec(s);
        this.execute(u, spec, cmd.target);
        this.echoCast(u, spec, cmd.target);
        break;
      }
      case 'item': {
        const it = ITEM_BY_NAME.get(cmd.item)!;
        this.hooks.removeItem(it.name);
        this.push(`${u.name} は ${it.name} を使った！`, 'turn', { actor: u.uid, action: it.name });
        this.execute(u, { name: it.name, effects: it.effects, conditions: [], target: it.target, isItem: true }, cmd.target);
        break;
      }
    }
    if (this.checkEnd()) {
      this.current = null;
      return this.phase;
    }
    if (u.extraActions > 0 && u.hp > 0) {
      u.extraActions--;
      this.phase = 'input';
      this.push(`${u.name} は続けて行動できる！（あと${u.extraActions + 1}回）`, 'info');
      return this.phase;
    }
    u.extraActions = 0;
    this.endTurn(u);
    this.current = null;
    return this.phase;
  }

  private validate(u: Unit, cmd: Command): string | null {
    if (u.extraActions > 0 && cmd.type !== 'skill' && cmd.type !== 'defend') return '連続行動中は技しか使えません';
    if (cmd.type === 'skill') {
      if (!u.char?.skills.includes(cmd.skill)) return 'その技は覚えていません';
      const s = SKILL_BY_NAME.get(cmd.skill)!;
      if (u.extraActions > 0 && s.effects.some((e) => e.kind === 'multiCast')) return '連続行動中は使えません';
      const why = this.cannotPay(u, s.cost, s.target);
      if (why) return why;
      return this.checkTarget(u, this.effectiveTarget(u, s.target, true), s.effects, cmd.target);
    }
    if (cmd.type === 'item') {
      const it = ITEM_BY_NAME.get(cmd.item);
      if (!it) return 'アイテムがありません';
      if (it.effects.some((e) => e.kind === 'restAll' || e.kind === 'levelUp')) return '戦闘中は使えません';
      if (it.effects.some((e) => e.kind === 'escape') && this.kind !== 'normal') return '強敵・ボスからは逃げられません';
      return this.checkTarget(u, it.target, it.effects, cmd.target);
    }
    if (cmd.type === 'attack') return this.checkTarget(u, 'enemy', [NORMAL_ATTACK], cmd.target);
    return null;
  }

  private checkTarget(u: Unit, kind: TargetKind, effects: Effect[], target?: number): string | null {
    if (kind !== 'enemy' && kind !== 'ally') return null;
    const ok = this.selectableTargets(u, kind, effects);
    if (ok.length === 0) return '対象がいません';
    if (target === undefined || !ok.some((x) => x.uid === target)) return '対象を選んでください';
    return null;
  }

  /** 単体技で選べる相手 */
  selectableTargets(u: Unit, kind: TargetKind, effects: Effect[]): Unit[] {
    if (kind === 'enemy') {
      const foes = this.alive(this.opposite(u.side));
      const taunters = foes.filter((f) => this.hasLinger(f, 'taunt'));
      return taunters.length > 0 ? taunters : foes;
    }
    if (kind === 'ally') {
      const reviving = effects.some((e) => e.kind === 'revive');
      return this.units.filter((x) => x.side === u.side && (reviving ? x.hp <= 0 : x.hp > 0));
    }
    return [];
  }

  /** アクセサリーで対象が変わったあとの対象 */
  effectiveTarget(u: Unit, kind: TargetKind, isSkill: boolean): TargetKind {
    if (!isSkill) return kind;
    for (const m of u.mods) {
      const t = m.target;
      if (!t) continue;
      if (t.from === 'single' && kind === 'enemy') return t.to === 'all' ? 'enemyAll' : 'random';
      if (t.from === 'all' && kind === 'enemyAll') return 'enemy';
      if (t.from === 'front' && kind === 'enemyFront') return 'enemyAll';
      if (t.from === 'ally' && kind === 'ally') return 'allyAll';
    }
    return kind;
  }

  private targetMods(u: Unit, kind: TargetKind): { powerMul: number; mpMul: number; random2: boolean } {
    for (const m of u.mods) {
      const t = m.target;
      if (!t) continue;
      const hit =
        (t.from === 'single' && kind === 'enemy') ||
        (t.from === 'all' && kind === 'enemyAll') ||
        (t.from === 'front' && kind === 'enemyFront') ||
        (t.from === 'ally' && kind === 'ally');
      if (hit) return { powerMul: t.powerMul, mpMul: t.mpMul, random2: t.to === 'random2' };
    }
    return { powerMul: 1, mpMul: 1, random2: false };
  }

  // ───────────────────────── コスト ─────────────────────────

  /** 「たたかう」を当てたときにたまるMP */
  attackMpGain(u: Unit): number {
    return Math.max(BALANCE.attackMp.min, Math.round(this.maxMp(u) * BALANCE.attackMp.ratio));
  }

  mpCost(u: Unit, cost: Cost, baseTarget: TargetKind): number {
    if (cost.kind !== 'mp') return 0;
    if (u.mods.some((m) => m.mpFree)) return 0;
    let c = cost.size === 'all' ? Math.max(1, u.mp) : BALANCE.mpCost[cost.size];
    for (const m of u.mods) if (m.mpCostMul) c *= m.mpCostMul;
    c *= this.targetMods(u, baseTarget).mpMul;
    return Math.max(cost.size === 'all' ? 1 : 0, Math.round(c));
  }

  hpCost(u: Unit, cost: Cost): number {
    if (cost.kind !== 'hp') return 0;
    return Math.max(1, Math.round(this.maxHp(u) * BALANCE.hpCostRatio[cost.size]));
  }

  /** 払えない理由（払えるなら null） */
  cannotPay(u: Unit, cost: Cost, baseTarget: TargetKind = 'self'): string | null {
    if (cost.kind === 'hp') return u.hp > this.hpCost(u, cost) ? null : 'HPが足りない';
    if (cost.kind === 'mp') {
      const need = this.mpCost(u, cost, baseTarget);
      if (u.mods.some((m) => m.hpInsteadOfMp)) return u.hp > need ? null : 'HPが足りない';
      if (cost.size === 'all' && u.mp <= 0) return 'MPが足りない';
      if (u.mp >= need) return null;
      if (u.mods.some((m) => m.mpDebtWithHp) && u.hp > need - u.mp) return null;
      return 'MPが足りない';
    }
    return null;
  }

  private pay(u: Unit, spec: ActionSpec) {
    const cost = spec.cost;
    if (!cost || spec.noCost) return;
    if (cost.kind === 'hp') {
      const c = this.hpCost(u, cost);
      u.hp -= c;
      this.push(`${u.name} はHPを${c}消費した。`, 'info');
      return;
    }
    if (cost.kind === 'mp') {
      const need = this.mpCost(u, cost, spec.target);
      if (u.mods.some((m) => m.hpInsteadOfMp)) {
        u.hp = Math.max(1, u.hp - need);
        return;
      }
      if (u.mp >= need) u.mp -= need;
      else {
        const lack = need - u.mp;
        u.mp = 0;
        u.hp = Math.max(1, u.hp - lack);
        this.push(`${u.name} は足りないMPをHP${lack}で払った。`, 'info');
      }
    }
  }

  // ───────────────────────── ターン開始・終了 ─────────────────────────

  private startTurn(u: Unit) {
    u.turnsTaken++;
    // 状態異常のダメージ
    const p = u.status.poison;
    if (p) {
      const dmg = Math.max(1, Math.round(this.maxHp(u) * BALANCE.status.poisonRatio * p.stacks * p.mul * (p.weak ? BALANCE.status.weakDamageMul : 1)));
      this.push(`${u.name} は毒で ${dmg} のダメージ！`, 'damage');
      this.loseHp(u, dmg, null);
      if (--p.turns <= 0) {
        delete u.status.poison;
        this.push(`${u.name} の毒が消えた。`, 'status');
      }
    }
    const b = u.status.burn;
    if (b && u.hp > 0) {
      const dmg = Math.max(1, Math.round(this.maxHp(u) * BALANCE.status.burnRatio * (b.weak ? BALANCE.status.weakDamageMul : 1)));
      this.push(`${u.name} はやけどで ${dmg} のダメージ！`, 'damage');
      this.loseHp(u, dmg, null);
      if (--b.turns <= 0) {
        delete u.status.burn;
        this.push(`${u.name} のやけどが治った。`, 'status');
      }
    }
    if (u.hp <= 0) return;
    // アクセサリー：毎ターン回復・減少・常に毒
    for (const m of u.mods) {
      if (m.regenRatio) this.healHp(u, Math.max(1, Math.round(this.maxHp(u) * m.regenRatio)), true);
      if (m.hpDrainRatio) this.loseHp(u, Math.max(1, Math.round(this.maxHp(u) * m.hpDrainRatio)), null);
      if (m.alwaysStatus === 'poison' && !u.status.poison) u.status.poison = { stacks: 1, turns: 99, mul: 1, weak: false };
    }
    if (u.hp <= 0) return;
    // 毎ターン効果
    for (const l of [...u.lingers]) {
      if (l.kind !== 'tick' || !l.tick) continue;
      const { effects, caster, randomEnemy } = l.tick;
      if (randomEnemy) {
        const foes = this.alive(this.opposite(u.side));
        if (foes.length > 0) this.applyTick(caster, this.rng.pick(foes), effects);
      } else {
        this.applyTick(caster, u, effects);
      }
      if (u.hp <= 0) return;
    }
    // 継続ターンを減らす
    for (const bf of u.buffs) bf.turns--;
    u.buffs = u.buffs.filter((bf) => bf.turns > 0);
    for (const l of u.lingers) if (!l.permanent) l.turns--;
    u.lingers = u.lingers.filter((l) => l.turns > 0);
  }

  private applyTick(caster: Unit, target: Unit, effects: Effect[]) {
    const ctx = this.newCtx({ name: '継続効果', effects, conditions: [], target: 'self' });
    for (const e of effects) this.applyEffect(caster, target, e, ctx);
  }

  private endTurn(u: Unit) {
    let delay = BALANCE.timeBase / this.spd(u);
    delay *= Math.max(0.15, 1 - BALANCE.hasteRatio * u.pendingHaste);
    u.pendingHaste = 0;
    if (u.turnsTaken === 1 && u.mods.some((m) => m.battleStartDoubleAction)) delay = 0.01;
    u.wait = this.now + delay;
    if (u.status.confuse && --u.status.confuse.turns <= 0) {
      delete u.status.confuse;
      this.push(`${u.name} は正気に戻った。`, 'status');
    }
  }

  private checkEnd(): boolean {
    if (this.phase === 'escaped') return true;
    if (this.alive('enemy').length === 0) {
      this.phase = 'won';
      this.push('戦闘に勝利した！', 'system');
      return true;
    }
    if (this.alive('player').length === 0) {
      this.phase = 'lost';
      this.push('パーティーは全滅した……', 'system');
      return true;
    }
    return false;
  }

  /** 前列が全滅したら後列が前に出る */
  private fixRows() {
    for (const side of ['player', 'enemy'] as Side[]) {
      const a = this.alive(side);
      if (a.length > 0 && a.every((u) => u.row === 'back')) {
        for (const u of a) u.row = 'front';
        if (this.log.length > 0) this.push(`${side === 'player' ? '味方' : '敵'}の後列が前に出た！`, 'info');
      }
    }
  }

  // ───────────────────────── 敵の行動 ─────────────────────────

  /** 敵の次の行動を決めておく（画面に予告として出す） */
  private planIntent(u: Unit) {
    const def = u.enemy;
    if (!def || u.hp <= 0) return;
    let action: EnemyAction | undefined;
    if (def.enrage && !u.enrageUsed && u.hp <= this.maxHp(u) / 2) {
      action = def.actions.find((a) => a.name === def.enrage);
    } else if (u.phase2 && def.halfHp?.pattern) {
      const p = def.halfHp.pattern;
      action = def.actions.find((a) => a.name === p[u.patternIndex % p.length]);
    } else if (def.pattern) {
      action = def.actions.find((a) => a.name === def.pattern![u.patternIndex % def.pattern!.length]);
    } else {
      action = this.rng.weighted(def.actions.filter((a) => (a.weight ?? 1) > 0).map((a) => [a, a.weight ?? 1] as [EnemyAction, number]));
    }
    if (!action) throw new Error(`${def.name} の行動が見つかりません`);
    const parsed = parseAction(action.effect);
    let targetUid: number | undefined;
    if (action.target === 'enemy') targetUid = this.enemyPickTarget(u)?.uid;
    if (action.target === 'ally') targetUid = this.enemyPickAlly(u, parsed.effects)?.uid;
    u.intent = { action, effects: parsed.effects, conditions: parsed.conditions, targetUid };
  }

  private enemyAct(u: Unit) {
    const def = u.enemy!;
    // 予告していた行動より優先：HPが半分を切って怒る
    if (def.enrage && !u.enrageUsed && u.hp <= this.maxHp(u) / 2 && u.intent?.action.name !== def.enrage) this.planIntent(u);
    if (!u.intent) this.planIntent(u);
    const intent = u.intent!;
    u.intent = undefined;
    const { action } = intent;
    if (action.name === def.enrage) u.enrageUsed = true;
    else if ((u.phase2 && def.halfHp?.pattern) || def.pattern) u.patternIndex++;
    this.push(`${u.name} の ${action.name}！`, 'turn', { actor: u.uid, action: action.name === 'たたかう' ? undefined : action.name });
    let target = intent.targetUid;
    // 狙っていた相手が倒れた・挑発された、などのときは狙い直す
    if (action.target === 'enemy') {
      const ok = this.selectableTargets(u, 'enemy', intent.effects);
      if (!ok.some((x) => x.uid === target)) target = this.enemyPickTarget(u)?.uid;
    }
    if (action.target === 'ally' && !this.alive(u.side).some((x) => x.uid === target)) target = this.enemyPickAlly(u, intent.effects)?.uid;
    this.execute(u, { name: action.name, effects: intent.effects, conditions: intent.conditions, target: action.target }, target);
    this.planIntent(u);
  }

  /** 画面表示用：敵の予告の説明 */
  describeIntent(u: Unit): { label: string; kind: 'attack' | 'aoe' | 'charge' | 'buff' | 'debuff' | 'heal' | 'guard' | 'special' } | null {
    const it = u.intent;
    if (!it || u.hp <= 0) return null;
    const effects = it.effects;
    const t = this.units.find((x) => x.uid === it.targetUid);
    const tname = t ? (t.char?.isHero ? '主人公' : t.name) : '';
    const dmg = effects.find((e) => e.kind === 'damage');
    if (effects.some((e) => e.kind === 'delayed')) return { label: `溜め：${it.action.name}`, kind: 'charge' };
    if (dmg && dmg.kind === 'damage') {
      const hits = dmg.hits[1] > 1 ? `×${dmg.hits[0] === dmg.hits[1] ? dmg.hits[0] : `${dmg.hits[0]}〜${dmg.hits[1]}`}` : '';
      if (it.action.target === 'enemyAll') return { label: `全体攻撃${hits}`, kind: 'aoe' };
      if (it.action.target === 'enemyFront') return { label: `前列攻撃${hits}`, kind: 'aoe' };
      if (it.action.target === 'random') return { label: `乱れ攻撃${hits}`, kind: 'attack' };
      return { label: `攻撃${hits}→${tname}`, kind: 'attack' };
    }
    if (effects.some((e) => e.kind === 'heal')) return { label: '回復', kind: 'heal' };
    if (effects.some((e) => e.kind === 'dispel')) return { label: '強化を解く', kind: 'debuff' };
    if (effects.some((e) => e.kind === 'status' || (e.kind === 'buff' && e.amount < 0) || e.kind === 'tick'))
      return { label: it.action.target === 'enemyAll' ? '全体に妨害' : `妨害→${tname}`, kind: 'debuff' };
    if (effects.some((e) => e.kind === 'buff' && e.amount > 0)) return { label: it.action.target === 'allyAll' ? '仲間を強化' : '強化', kind: 'buff' };
    if (effects.some((e) => e.kind === 'taunt' || e.kind === 'counter' || e.kind === 'cover' || e.kind === 'guard')) return { label: '守り', kind: 'guard' };
    return { label: it.action.name, kind: 'special' };
  }

  /** 敵が味方（敵側）を選ぶ：かばうなら自分以外、それ以外はHPの割合が一番低い仲間 */
  private enemyPickAlly(u: Unit, effects: Effect[]): Unit | undefined {
    const allies = this.alive(u.side);
    if (effects.some((e) => e.kind === 'cover')) {
      const others = allies.filter((a) => a !== u);
      return others.length > 0 ? this.rng.pick(others) : undefined;
    }
    return [...allies].sort((a, b) => a.hp / this.maxHp(a) - b.hp / this.maxHp(b))[0];
  }

  /** 敵が狙う相手：挑発 > 前列を狙いやすい */
  private enemyPickTarget(u: Unit): Unit | undefined {
    const foes = this.alive(this.opposite(u.side));
    const taunters = foes.filter((f) => this.hasLinger(f, 'taunt'));
    if (taunters.length > 0) return this.rng.pick(taunters);
    if (foes.length === 0) return undefined;
    if (u.enemy?.targetLowest) return [...foes].sort((a, b) => a.hp / this.maxHp(a) - b.hp / this.maxHp(b))[0];
    if (u.enemy?.targetFront) {
      const front = foes.filter((f) => f.row === 'front');
      if (front.length > 0) return this.rng.pick(front);
    }
    return this.rng.weighted(foes.map((f) => [f, f.row === 'front' ? BALANCE.targetWeight.front : BALANCE.targetWeight.back] as [Unit, number]));
  }

  private confusedAction(u: Unit) {
    const others = this.alive().filter((x) => x !== u);
    if (others.length === 0) return;
    const t = this.rng.pick(others);
    this.push(`${u.name} は混乱している！ ${t.name} に攻撃！`, 'status');
    this.execute(u, { name: 'こうげき', effects: [NORMAL_ATTACK], conditions: [], target: 'enemy', isAttack: true }, t.uid, true);
  }

  // ───────────────────────── 行動の実行 ─────────────────────────

  private newCtx(spec: ActionSpec): ActionCtx {
    return {
      spec,
      powerMul: spec.powerMul ?? 1,
      hitUnits: new Set(),
      dealtDamage: false,
      crit: false,
      random2: false,
      target: spec.target,
    };
  }

  private resolveTargets(u: Unit, kind: TargetKind, targetUid: number | undefined, effects: Effect[], forced = false): Unit[] {
    const foes = this.alive(this.opposite(u.side));
    switch (kind) {
      case 'self':
        return [u];
      case 'none':
        return [];
      case 'enemyAll':
        return foes;
      case 'enemyFront': {
        const front = foes.filter((f) => f.row === 'front');
        return front.length > 0 ? front : foes;
      }
      case 'random':
        return foes;
      case 'allyAll':
        return this.units.filter((x) => x.side === u.side && x.hp > 0);
      case 'enemy': {
        if (forced) {
          const t = this.units.find((x) => x.uid === targetUid && x.hp > 0);
          return t ? [t] : [];
        }
        const ok = this.selectableTargets(u, 'enemy', effects);
        const t = ok.find((x) => x.uid === targetUid) ?? (ok.length > 0 ? this.rng.pick(ok) : undefined);
        return t ? [t] : [];
      }
      case 'ally': {
        const ok = this.selectableTargets(u, 'ally', effects);
        const t = ok.find((x) => x.uid === targetUid) ?? (ok.length > 0 ? ok[0] : undefined);
        return t ? [t] : [];
      }
    }
  }

  /** 残響：魔法のあと、同じ魔法を MP なしで追加発動する */
  private echoCast(u: Unit, spec: ActionSpec, targetUid?: number) {
    if (!u.echo || !this.isMagicAction(spec) || spec.effects.some((e) => e.kind === 'delayed' || e.kind === 'echo')) return;
    const n = u.echo;
    u.echo = undefined;
    for (let i = 0; i < n; i++) {
      if (u.hp <= 0 || this.alive(this.opposite(u.side)).length === 0) return;
      // 狙っていた相手が倒れていたら、生きている相手に向け直す
      let t = targetUid;
      const cur = this.units.find((x) => x.uid === t);
      if (t !== undefined && (!cur || cur.hp <= 0)) t = this.alive(this.opposite(u.side))[0]?.uid;
      this.push(`残響！ ${spec.name} がもう一度発動する！`, 'turn', { actor: u.uid, action: `${spec.name}（残響）` });
      this.execute(u, { ...spec, noCost: true }, t);
    }
  }

  private isMagicAction(spec: ActionSpec): boolean {
    return spec.effects.some((e) => e.kind === 'damage' && (e.type === 'magic' || e.type === 'hybrid'));
  }

  private execute(u: Unit, spec: ActionSpec, targetUid?: number, forced = false) {
    const isSkill = !!spec.isSkill;
    const baseTarget = spec.target;
    const tm = isSkill ? this.targetMods(u, baseTarget) : { powerMul: 1, mpMul: 1, random2: false };
    const kind = this.effectiveTarget(u, baseTarget, isSkill);
    this.pay(u, spec);

    const ctx = this.newCtx(spec);
    ctx.target = kind;
    ctx.powerMul *= tm.powerMul;
    ctx.random2 = tm.random2;

    // 溜め：次のターンに発動
    const delayed = spec.effects.find((e) => e.kind === 'delayed');
    if (delayed && delayed.kind === 'delayed') {
      const noCharge = u.mods.find((m) => m.noCharge)?.noCharge;
      const chargeMul = u.mods.reduce((a, m) => a * (m.chargeMul ?? 1), 1);
      if (noCharge) {
        ctx.powerMul *= noCharge * chargeMul;
        spec = { ...spec, effects: delayed.effects };
        ctx.spec = spec;
      } else {
        u.delayed = { name: spec.name, effects: delayed.effects, conditions: spec.conditions, target: kind, targetUid, powerMul: ctx.powerMul * chargeMul };
        this.push(`${u.name} は力を溜めている……`, 'info');
        return;
      }
    }

    // 威力に関わるアクセサリー
    for (const m of u.mods) {
      if (!spec.isItem) {
        if (m.powerMul && isSkill) ctx.powerMul *= m.powerMul;
        if (m.hpFullPowerMul && u.hp >= this.maxHp(u)) ctx.powerMul *= m.hpFullPowerMul;
        if (m.statusedPowerMul && this.statusCount(u) > 0) ctx.powerMul *= m.statusedPowerMul;
        if (m.gamble && spec.effects.some((e) => e.kind === 'damage' || e.kind === 'heal')) {
          const win = this.rng.chance(0.5);
          ctx.powerMul *= win ? 2 : 0.5;
          this.push(win ? 'コインは表！ 威力2倍！' : 'コインは裏……威力半分。', 'info');
        }
      }
    }
    // 溜め（次の攻撃強化）を使う
    const dealsDamage = spec.effects.some((e) => e.kind === 'damage');
    if (u.charge && dealsDamage && !spec.isItem && !spec.isCounter) {
      const ok = u.charge.scope === 'magic' ? this.isMagicAction(spec) : true;
      if (ok) {
        const chargeMul = u.mods.reduce((a, m) => a * (m.chargeMul ?? 1), 1);
        ctx.powerMul *= u.charge.mul * chargeMul;
        ctx.crit = u.charge.crit;
        u.charge = undefined;
      }
    }

    const targets = this.resolveTargets(u, kind, targetUid, spec.effects, forced);
    for (const e of spec.effects) {
      if (e.kind === 'delayed') continue;
      if (e.kind === 'damage') {
        this.doDamageEffect(u, e, targets, kind, ctx);
        continue;
      }
      // ランダム対象の継続効果（雷の精霊）は自分に付けて毎ターン敵を狙う
      if (e.kind === 'tick' && kind === 'random') {
        this.addLinger(u, u, { kind: 'tick', turns: e.turns, sourceSide: u.side, tick: { effects: e.effects, caster: u, randomEnemy: true } });
        continue;
      }
      for (const t of targets) this.applyEffect(u, t, e, ctx);
    }

    // 「たたかう」が当たるとMPがたまる
    if (spec.isAttack && !forced && u.side === 'player' && u.hp > 0 && ctx.hitUnits.size > 0) {
      const gain = Math.min(this.attackMpGain(u), this.maxMp(u) - u.mp);
      if (gain > 0) {
        u.mp += gain;
        this.push(`${u.name} のMPが ${gain} たまった。`, 'heal');
      }
    }

    // 反撃
    if (!spec.isCounter && ctx.dealtDamage) {
      const physicalAction = spec.effects.some((e) => e.kind === 'damage' && (e.type === 'physical' || e.type === 'hybrid'));
      for (const t of ctx.hitUnits) {
        if (t.hp <= 0 || u.hp <= 0 || t.side === u.side) continue;
        const dc = t.lingers.find((l) => l.kind === 'dodgeCounter' && l.amount === -1);
        const c = t.lingers.find((l) => l.kind === 'counter' && (!l.physicalOnly || physicalAction));
        if (dc) t.lingers = t.lingers.filter((l) => l !== dc);
        if (dc || c) this.counterAttack(t, u, c?.status);
      }
    }
    this.fixRows();
  }

  private counterAttack(t: Unit, attacker: Unit, status?: StatusId) {
    if (t.status.stun) return;
    this.push(`${t.name} の反撃！`, 'turn', { actor: t.uid, action: '反撃' });
    const mul = t.mods.reduce((a, m) => a * (m.counterMul ?? 1), t.side === 'player' ? BALANCE.skill.counterPower : 1);
    const effects: Effect[] = [NORMAL_ATTACK];
    if (status) effects.push({ kind: 'status', status, stacks: 1 });
    this.execute(t, { name: '反撃', effects, conditions: [], target: 'enemy', isCounter: true, powerMul: mul }, attacker.uid, true);
  }

  private doDamageEffect(u: Unit, e: Extract<Effect, { kind: 'damage' }>, targets: Unit[], kind: TargetKind, ctx: ActionCtx) {
    let hits = this.rng.int(e.hits[0], e.hits[1]);
    let perHit = 1;
    const extra = u.mods.find((m) => m.extraHit)?.extraHit;
    if (extra && hits > 1) {
      hits += 1;
      perHit = extra;
    }
    if (kind === 'random' || ctx.random2) {
      const n = ctx.random2 ? hits * 2 : hits;
      for (let i = 0; i < n; i++) {
        const foes = this.alive(this.opposite(u.side));
        if (foes.length === 0) break;
        this.dealDamage(u, this.rng.pick(foes), e, ctx, perHit);
      }
      return;
    }
    for (const t of targets) {
      for (let i = 0; i < hits; i++) {
        if (t.hp <= 0) break;
        this.dealDamage(u, t, e, ctx, perHit);
      }
    }
  }

  /** 威力が変わる条件 */
  private conditionMul(u: Unit, t: Unit, conds: Condition[]): number {
    let m = 1;
    const ratio = t.hp / this.maxHp(t);
    for (const c of conds) {
      switch (c) {
        case 'targetStatused':
          if (this.statusCount(t) > 0) m *= 1.6;
          break;
        case 'targetPoisoned':
          if (t.status.poison) m *= BALANCE.skill.poisonedMul;
          break;
        case 'targetPoisonedHuge':
          if (t.status.poison) m *= BALANCE.skill.poisonedHugeMul;
          break;
        case 'selfHpLow':
          m *= 1 + (1 - u.hp / this.maxHp(u)) * BALANCE.skill.selfHpLowMul;
          break;
        case 'defHigh':
          m *= 1 + this.stat(u, 'def') / BALANCE.skill.defHighDiv;
          break;
        case 'spdHigh':
          m *= 1 + this.stat(u, 'spd') / 25;
          break;
        case 'targetHpLow':
          m *= 1 + (1 - ratio) * 1.5;
          break;
        case 'targetHpHigh':
          m *= 1 + ratio * 0.6;
          break;
        case 'targetStatusCount':
          m *= 1 + 0.4 * (this.statusCount(t) + this.debuffCount(t));
          break;
        case 'selfBuffCount':
          m *= 1 + 0.3 * u.buffs.filter((b) => b.amount > 0).length;
          break;
        case 'lingeringCount':
          m *= 1 + 0.35 * this.units.reduce((a, x) => a + x.lingers.filter((l) => l.sourceSide === u.side && l.kind !== 'defend').length, 0);
          break;
        case 'lastAttacker':
          if (u.lastAttackerUid === t.uid) m *= 1.7;
          break;
        case 'lifestealSelfHpLow':
          break;
      }
    }
    return m;
  }

  private dealDamage(u: Unit, target: Unit, e: Extract<Effect, { kind: 'damage' }>, ctx: ActionCtx, perHit: number) {
    let t = target;
    const single = ctx.target === 'enemy' || ctx.target === 'random';
    let covered = false;
    // かばう
    if (single && t.side !== u.side) {
      const coverer = this.alive(t.side).find((x) => x !== t && x.lingers.some((l) => l.kind === 'cover' && l.coverTarget === t.uid));
      if (coverer) {
        this.push(`${coverer.name} が ${t.name} をかばった！`, 'info');
        t = coverer;
        covered = true;
      }
    }
    const physical = e.type === 'physical' || e.type === 'hybrid';
    // 回避
    if (physical && t.side !== u.side && !ctx.spec.isItem) {
      const dc = t.lingers.find((l) => l.kind === 'dodgeCounter' && l.amount !== -1);
      if (dc) {
        dc.amount = -1; // 回避済み→あとで反撃
        ctx.hitUnits.add(t);
        ctx.dealtDamage = true;
        this.push(`${t.name} は攻撃を見切った！`, 'info', { miss: t.uid });
        return;
      }
      if (this.rng.chance(this.evasion(t))) {
        this.push(`${t.name} はひらりとかわした！`, 'info', { miss: t.uid });
        return;
      }
    }

    let dmg: number;
    const K = BALANCE.defenseK;
    const power = (e.power ?? BALANCE.power[e.size]) * perHit;
    if (e.type === 'fixed') {
      dmg = BALANCE.fixedDamage[e.size];
    } else if (e.type === 'hybrid') {
      const a = (this.stat(u, 'atk') + this.stat(u, 'mag')) * 0.6;
      const d = (this.stat(t, 'def') + this.stat(t, 'spr')) / 2;
      dmg = (a * power * K) / (K + d);
    } else {
      const a = this.stat(u, physical ? 'atk' : 'mag');
      const d = this.stat(t, physical ? 'def' : 'spr');
      dmg = (a * power * K) / (K + d);
    }
    dmg *= ctx.powerMul;
    dmg *= this.conditionMul(u, t, ctx.spec.conditions);
    // 隊列：近接の物理攻撃だけ影響を受ける
    if (e.type === 'physical' && !u.ranged && !ctx.spec.isItem) {
      if (u.row === 'back') dmg *= BALANCE.backRowMeleeMul;
      if (t.row === 'back') dmg *= BALANCE.backRowMeleeMul;
    }
    if (this.hasLinger(t, 'defend')) dmg *= 0.5;
    for (const l of t.lingers) if (l.kind === 'guard' && l.amount) dmg *= l.amount;
    if (!physical) for (const m of t.mods) if (m.magicDamageTakenMul) dmg *= m.magicDamageTakenMul;
    for (const m of t.mods) if (m.damageTakenMul) dmg *= m.damageTakenMul;
    if (covered) for (const m of t.mods) if (m.coverDamageMul) dmg *= m.coverDamageMul;
    if (t.side === 'player' && t.side !== u.side) {
      if (covered) dmg *= BALANCE.skill.coverDamageMul;
      else if (this.hasLinger(t, 'taunt')) dmg *= BALANCE.skill.tauntDamageMul;
    }
    const crit = ctx.crit || e.crit || (!ctx.spec.isItem && this.rng.chance(BALANCE.critChance));
    if (crit) dmg *= BALANCE.critMul;
    dmg *= 1 + (this.rng.next() * 2 - 1) * BALANCE.variance;
    const final = Math.max(1, Math.round(dmg));

    this.push(`${crit ? '会心の一撃！ ' : ''}${t.name} に ${final} のダメージ！`, 'damage');
    const dealt = this.loseHp(t, final, u);
    ctx.dealtDamage = true;
    if (t.side !== u.side) {
      ctx.hitUnits.add(t);
      t.lastAttackerUid = u.uid;
    }

    // 吸収
    const imbueLifesteal = physical && u.lingers.some((l) => l.kind === 'imbue' && l.what === 'lifesteal');
    const accLifesteal = physical && u.mods.some((m) => m.physicalLifesteal);
    if (e.lifesteal || imbueLifesteal || accLifesteal) {
      let r = 0.3;
      if (ctx.spec.conditions.includes('lifestealSelfHpLow')) r += (1 - u.hp / this.maxHp(u)) * 0.6;
      const heal = Math.max(1, Math.round(dealt * r));
      this.healHp(u, heal, true);
    }
    if (t.hp > 0 && t.side !== u.side) {
      // 攻撃に付け足す効果
      if (physical && u.lingers.some((l) => l.kind === 'imbue' && l.what === 'poison')) this.applyStatus(u, t, 'poison', 1);
      if (physical && u.lingers.some((l) => l.kind === 'imbue' && l.what === 'magic')) {
        const extra = Math.max(1, Math.round((this.stat(u, 'mag') * 0.6 * K) / (K + this.stat(t, 'spr'))));
        this.push(`魔力の追撃！ ${t.name} に ${extra} のダメージ！`, 'damage');
        this.loseHp(t, extra, u);
      }
      for (const m of u.mods) {
        if (m.physicalStatus && physical && t.hp > 0) this.applyStatus(u, t, m.physicalStatus, 1);
        if (m.magicStatus && !physical && e.type !== 'fixed' && t.hp > 0) this.applyStatus(u, t, m.magicStatus, 1);
        if (m.confuseOnHitChance && t.hp > 0 && this.rng.chance(m.confuseOnHitChance)) this.applyStatus(u, t, 'confuse', 1);
      }
    }
    if (u.side === 'player' && t.side === 'enemy') {
      for (const m of u.mods) if (m.goldOnAttack) this.hooks.addGold(m.goldOnAttack);
    }
    // 野盗：お金を盗む
    if (u.enemy?.stealGold && t.side === 'player' && ctx.spec.name === '盗む') {
      const g = Math.min(this.hooks.getGold(), u.enemy.stealGold);
      if (g > 0) {
        this.hooks.addGold(-g);
        u.stolenGold += g;
        this.push(`${u.name} は ${g}G を盗んだ！`, 'status');
      }
    }
  }

  private evasion(t: Unit): number {
    let ev = BALANCE.baseEvasion + (t.enemy?.evasion ?? 0);
    for (const l of t.lingers) if (l.kind === 'evade' && l.amount) ev += l.amount;
    for (const m of t.mods) {
      if (m.evasionAdd) ev += m.evasionAdd;
      if (m.evasionIf && this.condOk(t, m.evasionIf.cond)) ev += m.evasionIf.add;
    }
    return Math.min(0.75, ev);
  }

  /** HPを減らす。実際に減った量を返す */
  private loseHp(t: Unit, amount: number, from: Unit | null): number {
    if (t.hp <= 0) return 0;
    const wasFull = t.hp >= this.maxHp(t);
    let next = t.hp - amount;
    if (next <= 0) {
      if (t.mods.some((m) => m.endureAtFullHp) && wasFull) {
        next = 1;
        this.push(`${t.name} は根性で踏みとどまった！`, 'info');
      } else if (!t.endureUsed && t.mods.some((m) => m.endureOnce === 'battle')) {
        t.endureUsed = true;
        next = 1;
        this.push(`不死鳥の羽が輝き、${t.name} はHP1で耐えた！`, 'info');
      } else if (t.char && t.char.accessories.includes('身代わり人形')) {
        next = 1;
        this.hooks.breakAccessory(t.char, '身代わり人形');
        t.mods = this.playerMods(t.char);
        this.push(`身代わり人形が壊れ、${t.name} は倒れずにすんだ！`, 'info');
      }
    }
    const lost = t.hp - Math.max(0, next);
    t.hp = Math.max(0, next);
    if (t.hp > 0 && from && from.side !== t.side) {
      for (const m of t.mods) if (m.onDamagedAtkUp) t.buffs.push({ stat: 'atk', amount: m.onDamagedAtkUp, turns: 99 });
    }
    if (t.hp <= 0) this.onDeath(t, from);
    else this.checkHalfHp(t);
    return lost;
  }

  /** テスト用：直接ダメージを与える */
  submitDamageForTest(t: Unit, amount: number) {
    this.loseHp(t, amount, null);
  }

  /** HPが半分以下になったら第2段階へ */
  private checkHalfHp(t: Unit) {
    const def = t.enemy;
    if (def?.enrage && !t.enrageUsed && t.hp <= this.maxHp(t) / 2 && t.intent?.action.name !== def.enrage) this.planIntent(t);
    const half = t.enemy?.halfHp;
    if (!half || t.phase2 || t.hp > this.maxHp(t) / 2) return;
    t.phase2 = true;
    t.patternIndex = 0;
    if (half.immuneAll) t.status = {};
    this.push(half.text, 'system');
    this.planIntent(t);
  }

  private onDeath(t: Unit, from: Unit | null) {
    t.status = {};
    t.buffs = [];
    t.lingers = [];
    t.delayed = undefined;
    t.charge = undefined;
    this.push(t.side === 'enemy' ? `${t.name} をたおした！` : `${t.name} は倒れた……`, 'system');
    // 他のユニットがかけていた「かばう」の解除
    for (const u of this.units) u.lingers = u.lingers.filter((l) => !(l.kind === 'cover' && l.coverTarget === t.uid));
    if (t.side === 'enemy') {
      if (t.stolenGold > 0) {
        this.hooks.addGold(t.stolenGold);
        this.push(`盗まれた ${t.stolenGold}G を取り返した！`, 'info');
        t.stolenGold = 0;
      }
      if (t.enemy?.packRage) {
        for (const w of this.alive('enemy').filter((x) => x.enemy?.name === t.enemy?.name)) {
          w.buffs.push({ stat: 'atk', amount: 0.25, turns: 99 });
          this.push(`${w.name} は怒り狂っている！（攻撃力アップ）`, 'status');
        }
      }
    }
    if (from && from.side !== t.side && from.hp > 0 && from.mods.some((m) => m.onKillHaste)) from.pendingHaste += 1;
    for (const ally of this.alive(t.side)) {
      const up = ally.mods.reduce((a, m) => a + (m.allyDownAllUp ?? 0), 0);
      if (up > 0) {
        for (const s of ['atk', 'def', 'mag', 'spr', 'spd'] as Stat[]) ally.buffs.push({ stat: s, amount: up, turns: 99 });
        this.push(`${ally.name} は仲間の仇を討つ決意をした！`, 'status');
      }
    }
  }

  private healHp(t: Unit, amount: number, quiet = false): number {
    if (t.hp <= 0) return 0;
    const before = t.hp;
    t.hp = Math.min(this.maxHp(t), t.hp + Math.round(amount));
    const healed = t.hp - before;
    if (!quiet || healed > 0) this.push(`${t.name} のHPが ${healed} 回復した。`, 'heal');
    return healed;
  }

  private blocksSupport(u: Unit, t: Unit) {
    return u !== t && t.side === u.side && t.mods.some((m) => m.noSupport);
  }

  private lingerTurns(u: Unit, turns: number) {
    return turns + u.mods.reduce((a, m) => a + (m.lingeringPlus ?? 0), 0);
  }

  private addLinger(u: Unit, t: Unit, l: Linger) {
    l.turns = this.lingerTurns(u, l.turns);
    t.lingers.push(l);
  }

  applyStatus(u: Unit, t: Unit, status: StatusId, stacks: number) {
    if (t.hp <= 0) return;
    if (t.lingers.some((l) => l.kind === 'ward')) {
      this.push(`${t.name} は守りの力で${STATUS_LABEL[status]}を防いだ。`, 'status');
      return;
    }
    const immune = [...(t.enemy?.immune ?? []), ...t.mods.flatMap((m) => m.immune ?? [])];
    if (t.phase2 && t.enemy?.halfHp?.immuneAll) immune.push(status);
    if (immune.includes(status)) {
      this.push(`${t.name} に${STATUS_LABEL[status]}は効かない！`, 'status');
      return;
    }
    const weak = !!t.enemy?.weak?.includes(status);
    let chance = BALANCE.status.baseChance + ((this.stat(u, 'mag') + this.stat(u, 'spr')) / 2 - this.stat(t, 'spr')) * 0.02;
    if (weak) chance += BALANCE.status.weakBonus;
    chance *= t.enemy?.statusResist ?? 1;
    for (const m of t.mods) chance *= m.statusResistMul ?? 1;
    chance = Math.min(0.95, Math.max(0.1, chance));
    if (u.side === t.side) chance = 1;
    if (!this.rng.chance(chance)) {
      this.push(`${t.name} は${STATUS_LABEL[status]}にならなかった。`, 'status');
      return;
    }
    const durMul = u.mods.reduce((a, m) => a * (m.statusDurationMul ?? 1), 1);
    const st = BALANCE.status;
    switch (status) {
      case 'poison': {
        const mul = u.mods.reduce((a, m) => a * (m.poisonDamageMul ?? 1), 1);
        const cur = t.status.poison;
        const total = Math.min(st.poisonMaxStacks, (cur?.stacks ?? 0) + stacks);
        t.status.poison = { stacks: total, turns: Math.round(st.poisonTurns * durMul), mul: Math.max(mul, cur?.mul ?? 1), weak };
        this.push(`${t.name} は毒になった！${total > 1 ? `（${total}重）` : ''}`, 'status');
        break;
      }
      case 'burn':
        t.status.burn = { turns: Math.round(st.burnTurns * durMul), weak };
        this.push(`${t.name} はやけどを負った！`, 'status');
        break;
      case 'confuse':
        t.status.confuse = { turns: Math.round(st.confuseTurns * durMul) };
        this.push(`${t.name} は混乱した！`, 'status');
        break;
      case 'stun':
        t.status.stun = true;
        if (t.delayed) {
          t.delayed = undefined;
          this.push(`${t.name} の溜めが崩れた！`, 'status');
        }
        this.push(`${t.name} はスタンした！`, 'status');
        break;
    }
  }

  private applyEffect(u: Unit, t: Unit, e: Effect, ctx: ActionCtx) {
    const isItem = !!ctx.spec.isItem;
    switch (e.kind) {
      case 'damage':
        this.dealDamage(u, t, e, ctx, 1);
        return;
      case 'heal': {
        if (t.hp <= 0) return;
        if (this.blocksSupport(u, t)) return void this.push(`${t.name} は回復を受け付けない。`, 'info');
        let amount: number;
        if (e.size === 'full') amount = this.maxHp(t);
        else if (isItem) amount = BALANCE.fixedHeal[e.size];
        else {
          const h = BALANCE.heal[e.size];
          amount = (this.stat(u, 'spr') * h.mul + h.flat) * ctx.powerMul;
          for (const m of u.mods) amount *= m.healMul ?? 1;
        }
        const healed = this.healHp(t, amount);
        const spill = u.mods.reduce((a, m) => a + (m.healSpill ?? 0), 0);
        if (spill > 0 && healed > 0 && ctx.target === 'ally') {
          for (const o of this.alive(u.side)) if (o !== t) this.healHp(o, healed * spill);
        }
        return;
      }
      case 'mpHeal': {
        if (t.hp <= 0) return;
        const amount = e.size === 'full' ? this.maxMp(t) : BALANCE.mpHeal[e.size];
        const before = t.mp;
        t.mp = Math.min(this.maxMp(t), t.mp + amount);
        this.push(`${t.name} のMPが ${t.mp - before} 回復した。`, 'heal');
        return;
      }
      case 'revive': {
        if (t.hp > 0) return;
        let ratio = e.hp === 'tiny' ? 0.1 : e.hp === 'normal' ? 0.3 : 1;
        if (u.mods.some((m) => m.reviveHalf)) ratio = Math.max(ratio, 0.5);
        t.hp = Math.max(1, Math.round(this.maxHp(t) * ratio));
        t.wait = this.now + BALANCE.timeBase / this.spd(t);
        this.push(`${t.name} は生き返った！`, 'heal');
        return;
      }
      case 'status':
        this.applyStatus(u, t, e.status, e.stacks);
        return;
      case 'cure': {
        let any = false;
        for (const s of e.statuses) {
          if (t.status[s]) {
            // 「常に毒」のアクセサリーの毒は治らない
            if (s === 'poison' && t.mods.some((m) => m.alwaysStatus === 'poison')) continue;
            delete t.status[s];
            any = true;
          }
        }
        if (any) this.push(`${t.name} の状態異常が治った。`, 'heal');
        return;
      }
      case 'ward':
        this.addLinger(u, t, { kind: 'ward', turns: e.turns, sourceSide: u.side });
        this.push(`${t.name} は状態異常を防ぐ光に包まれた。`, 'info');
        return;
      case 'buff': {
        if (t.hp <= 0) return;
        const positive = e.amount > 0;
        if (positive && this.blocksSupport(u, t)) return void this.push(`${t.name} は強化を受け付けない。`, 'info');
        let amount = e.amount;
        if (positive && !isItem) for (const m of u.mods) amount *= m.buffMul ?? 1;
        const turns = positive && !isItem ? this.lingerTurns(u, e.turns) : e.turns;
        for (const s of e.stats) t.buffs.push({ stat: s, amount, turns });
        const label = e.stats.length >= 5 ? '全ステータス' : e.stats.map((s) => STAT_LABEL[s]).join('・');
        this.push(`${t.name} の${label}が${positive ? '上がった' : '下がった'}！`, 'status');
        if (positive && t !== u && u.mods.some((m) => m.shareBuffs) && !ctx.hitUnits.has(u)) {
          ctx.hitUnits.add(u); // 1回の行動につき1回だけ自分にも
          for (const s of e.stats) u.buffs.push({ stat: s, amount, turns });
          this.push(`共鳴の鈴が鳴り、${u.name} も強化された！`, 'status');
        }
        return;
      }
      case 'dispel': {
        const before = t.buffs.length;
        t.buffs = t.buffs.filter((b) => b.amount < 0);
        t.charge = undefined;
        t.lingers = t.lingers.filter((l) => l.permanent || l.sourceSide !== t.side);
        this.push(before > 0 ? `${t.name} の強化が打ち消された！` : `${t.name} には打ち消す強化がなかった。`, 'status');
        return;
      }
      case 'charge':
        t.charge = { mul: e.mul, crit: !!e.crit, scope: e.scope };
        this.push(`${t.name} は力を溜めた！`, 'info');
        return;
      case 'echo':
        // 重ねがけは「追加2回」まで（溜めすぎて一撃が極端に大きくならないように）
        u.echo = Math.min(2, (u.echo ?? 0) + e.count);
        this.push(`${u.name} の詠唱が響いている……（次の魔法が${u.echo + 1}回発動）`, 'info');
        return;
      case 'multiCast':
        u.extraActions = e.count;
        this.push(`${u.name} は詠唱を重ねる！`, 'info');
        return;
      case 'haste': {
        if (t.hp <= 0) return;
        if (t === this.current || (t === u && e.amount > 0)) {
          t.pendingHaste += e.amount;
        } else {
          const step = (BALANCE.timeBase / this.spd(t)) * BALANCE.hasteRatio * e.amount;
          t.wait = Math.max(this.now + 0.001, t.wait - step);
        }
        this.push(`${t.name} の行動順が${e.amount > 0 ? '早まった' : '遅れた'}！`, 'status');
        return;
      }
      case 'cover':
        if (t === u) return;
        this.addLinger(u, u, { kind: 'cover', turns: e.turns, sourceSide: u.side, coverTarget: t.uid });
        this.push(`${u.name} は ${t.name} をかばう構えをとった。`, 'info');
        return;
      case 'taunt':
        this.addLinger(u, t, { kind: 'taunt', turns: e.turns, sourceSide: u.side });
        this.push(`${t.name} は敵の注意を引きつけた！`, 'info');
        return;
      case 'counter':
        this.addLinger(u, t, { kind: 'counter', turns: e.turns, sourceSide: u.side, status: e.status });
        this.push(`${t.name} は反撃の構えをとった。`, 'info');
        return;
      case 'evade':
        this.addLinger(u, t, { kind: 'evade', turns: e.turns, sourceSide: u.side, amount: e.amount });
        this.push(`${t.name} の回避率が上がった！`, 'status');
        return;
      case 'dodgeCounter':
        t.lingers.push({ kind: 'dodgeCounter', turns: 1, sourceSide: u.side });
        this.push(`${t.name} は相手の動きを見切ろうとしている。`, 'info');
        return;
      case 'guard':
        this.addLinger(u, t, { kind: 'guard', turns: e.turns, sourceSide: u.side, amount: e.mul });
        this.push(`${t.name} は守りの力に包まれた。`, 'info');
        return;
      case 'tick':
        this.addLinger(u, t, { kind: 'tick', turns: e.turns, sourceSide: u.side, tick: { effects: e.effects, caster: u, randomEnemy: false } });
        this.push(`${t.name} に${u.side === t.side ? '恵み' : '力'}がとどまり続ける……`, 'info');
        return;
      case 'imbue':
        this.addLinger(u, t, { kind: 'imbue', turns: e.turns, sourceSide: u.side, what: e.what });
        this.push(`${t.name} の攻撃に${e.what === 'lifesteal' ? '吸収' : e.what === 'poison' ? '毒' : '魔力'}が宿った！`, 'status');
        return;
      case 'steal': {
        if (t.stolenFrom || t.side === u.side) return void this.push(`${t.name} は何も持っていない。`, 'info');
        if (!this.rng.chance(e.rare ? BALANCE.skill.stealChance.rare : BALANCE.skill.stealChance.normal)) return void this.push('盗みに失敗した！', 'info');
        t.stolenFrom = true;
        const pool = ITEMS.filter((i) => i.rare === e.rare && !i.effects.some((x) => x.kind === 'levelUp'));
        const it = this.rng.pick(pool);
        if (this.hooks.addItem(it.name)) this.push(`${it.name} を盗んだ！`, 'info');
        else this.push(`${it.name} を盗んだが、持ちきれずに捨てた……`, 'info');
        return;
      }
      case 'gold': {
        const g = this.rng.int(5, 10);
        this.hooks.addGold(g);
        this.push(`${g}G を手に入れた！`, 'info');
        return;
      }
      case 'bonusReward':
        if (this.rewardMul < 1.5) this.rewardMul = 1.5;
        this.push('この戦闘の報酬が増える！', 'info');
        return;
      case 'escape':
        if (this.kind !== 'normal') return void this.push('強敵からは逃げられない！', 'info');
        this.phase = 'escaped';
        this.push('煙にまぎれて逃げ出した！', 'system');
        return;
      case 'restAll':
      case 'levelUp':
      case 'delayed':
        return;
    }
  }

  // ───────────────────────── 戦闘の後片付け ─────────────────────────

  /** 戦闘の結果をキャラクターに書き戻す */
  finish(): { exp: number; gold: number } {
    for (const u of this.units) {
      if (!u.char) continue;
      u.char.hp = Math.max(0, Math.min(u.hp, characterStats(u.char).hp));
      u.char.mp = Math.max(0, u.mp);
      if (u.hp > 0) {
        for (const m of u.mods) if (m.battleEndMpRatio) u.char.mp = Math.min(characterStats(u.char).mp, u.char.mp + Math.round(u.base.mp * m.battleEndMpRatio));
      }
    }
    if (this.phase !== 'won') return { exp: 0, gold: 0 };
    // 再起の加護：倒れた仲間が起き上がる
    for (const u of this.units) {
      const ratio = Math.max(0, ...u.mods.map((m) => m.reviveAfterBattle ?? 0));
      if (u.char && u.char.hp <= 0 && ratio > 0) u.char.hp = Math.max(1, Math.round(characterStats(u.char).hp * ratio));
    }
    const defeated = this.units.filter((u) => u.side === 'enemy');
    const vm = (u: Unit) => (u.variant ? VARIANT_REWARD : 1);
    const exp = Math.round(defeated.reduce((a, u) => a + (u.enemy?.exp ?? 0) * vm(u), 0) * this.rewardMul);
    let gold = defeated.reduce((a, u) => a + (u.enemy?.gold ?? 0) * vm(u), 0) * this.rewardMul;
    const goldMul = this.units.filter((u) => u.side === 'player').reduce((a, u) => a * u.mods.reduce((b, m) => b * (m.goldMul ?? 1), 1), 1);
    gold = Math.round(gold * goldMul);
    return { exp, gold };
  }
}

export function skillSpec(s: SkillDef): ActionSpec {
  return { name: s.name, effects: s.effects, conditions: s.conditions, target: s.target, cost: s.cost, isSkill: true };
}
