// ラン（1回の挑戦）全体の状態と、マップ上での出来事（報酬・ショップ・休憩所・仲間加入など）。
// RunState は JSON にそのまま保存できる形にしている。

import { ACCESSORIES, ACCESSORY_BY_NAME, ARCHETYPES, ITEMS, ITEM_BY_NAME, JOBS, JOB_BY_NAME, SKILLS, SKILL_BY_NAME } from '../data';
import { ENCOUNTERS } from '../data/enemies';
import { EQUIPMENT, type EquipmentDef } from '../data/equipment';
import { BALANCE } from './balance';
import { accessoryMods, characterStats, clampVitals, createCharacter, gainExp, levelUp, skillSlots, type Character } from './character';
import { generateMap, nextChoices, findNode, type FloorMap, type MapNode } from './map';
import { Rng } from './rng';
import type { BattleHooks, BattleKind } from './battle';

export type InvKind = 'item' | 'book' | 'equip' | 'acc';
export interface InvEntry {
  kind: InvKind;
  name: string;
}

export interface RunState {
  version: 1;
  seed: number;
  rngState: number;
  floor: number;
  map: FloorMap;
  current: string | null;
  visited: string[];
  party: Character[];
  gold: number;
  inventory: InvEntry[];
  log: { battles: number; kills: number; elites: number };
  /** ショップの品ぞろえ（入ったときに決まる） */
  shop?: ShopStock;
  /** ボス撃破後の仲間候補 */
  recruits?: Character[];
  result?: 'dead' | 'demoClear';
}

/** 1層の数値しかないので、いまは1層クリアで試作版のクリアとする */
export const LAST_PLAYABLE_FLOOR = 1;

class RunRng extends Rng {
  constructor(private run: RunState) {
    super(run.rngState);
  }
  override next(): number {
    const v = super.next();
    this.run.rngState = this.state;
    return v;
  }
}
export function rngOf(run: RunState): Rng {
  return new RunRng(run);
}

// ───────────────────────── ラン開始 ─────────────────────────

/** 職業ごとの「最初の1冊」の候補（各方向性のいちばん最初の本） */
export function starterBooks(job: string): string[] {
  return ARCHETYPES.filter((a) => a.job === job).map((a) => SKILLS.find((s) => s.job === job && s.archetype === a.name && !s.rare)!.name);
}

function starterGear(c: Character) {
  const lineage = JOB_BY_NAME.get(c.job)!.lineage;
  c.weapon = EQUIPMENT.find((e) => e.lineage === lineage && e.slot === 'weapon' && e.tier === 0)!.name;
  c.armor = EQUIPMENT.find((e) => e.lineage === lineage && e.slot === 'armor' && e.tier === 0)!.name;
  const st = characterStats(c);
  c.hp = st.hp;
  c.mp = st.mp;
}

export function newRun(job: string, starterBook: string, seed = Math.floor(Math.random() * 2 ** 31)): RunState {
  const hero = createCharacter(job, 1, true, '主人公');
  hero.skills.push(starterBook);
  starterGear(hero);
  const run: RunState = {
    version: 1,
    seed,
    rngState: seed,
    floor: 1,
    map: { rows: 0, cols: 0, nodes: [] },
    current: null,
    visited: [],
    party: [hero],
    gold: BALANCE.startGold,
    inventory: [
      { kind: 'item', name: '薬草' },
      { kind: 'item', name: '薬草' },
    ],
    log: { battles: 0, kills: 0, elites: 0 },
  };
  run.map = generateMap(rngOf(run));
  return run;
}

// ───────────────────────── 持ち物 ─────────────────────────

export function inventoryLimit(run: RunState): number {
  return BALANCE.inventoryLimit + run.party.reduce((a, c) => a + accessoryMods(c).reduce((b, m) => b + (m.inventoryPlus ?? 0), 0), 0);
}

export function inventoryFull(run: RunState): boolean {
  return run.inventory.length >= inventoryLimit(run);
}

export function addToInventory(run: RunState, entry: InvEntry): boolean {
  if (inventoryFull(run)) return false;
  run.inventory.push(entry);
  return true;
}

export function removeFromInventory(run: RunState, index: number): InvEntry {
  const [e] = run.inventory.splice(index, 1);
  if (!e) throw new Error('その持ち物はありません');
  return e;
}

export function removeItemByName(run: RunState, name: string) {
  const i = run.inventory.findIndex((e) => e.kind === 'item' && e.name === name);
  if (i >= 0) run.inventory.splice(i, 1);
}

export function partyMods(run: RunState) {
  return run.party.flatMap((c) => accessoryMods(c));
}

// ───────────────────────── 値段 ─────────────────────────

export function basePrice(e: InvEntry): number {
  const p = BALANCE.price;
  switch (e.kind) {
    case 'item':
      return p.item[ITEM_BY_NAME.get(e.name)!.priceRank] ?? 35;
    case 'book':
      return SKILL_BY_NAME.get(e.name)!.rare ? p.book.レア : p.book.通常;
    case 'equip':
      return p.equipment[EQUIPMENT.find((x) => x.name === e.name)!.tier];
    case 'acc':
      return ACCESSORY_BY_NAME.get(e.name)!.rare ? p.accessory.レア : p.accessory.通常;
  }
}

export function buyPrice(run: RunState, e: InvEntry): number {
  const discount = partyMods(run).reduce((a, m) => a + (m.shopDiscount ?? 0), 0);
  return Math.max(1, Math.round(basePrice(e) * (1 - Math.min(0.5, discount))));
}

export function sellPrice(run: RunState, e: InvEntry): number {
  const mul = partyMods(run).reduce((a, m) => a * (m.sellMul ?? 1), 1);
  return Math.max(1, Math.round(basePrice(e) * BALANCE.price.sellRatio * mul));
}

// ───────────────────────── 抽選 ─────────────────────────

function rollBook(run: RunState, rng: Rng, rareChance: number, partyRatio: number): string {
  const partyJobs = [...new Set(run.party.map((c) => c.job))];
  const job = rng.chance(partyRatio) ? rng.pick(partyJobs) : rng.pick(JOBS).name;
  const rare = rng.chance(rareChance);
  return rng.pick(SKILLS.filter((s) => s.job === job && s.rare === rare)).name;
}

function rollEquipment(run: RunState, rng: Rng, tier: number): string {
  // パーティーの系統の装備が出やすい
  const lineages = run.party.map((c) => JOB_BY_NAME.get(c.job)!.lineage);
  const lineage = rng.chance(0.7) ? rng.pick(lineages) : rng.pick(['剣士系', '魔法系', '技巧系', '支援系'] as const);
  const pool = EQUIPMENT.filter((e) => e.lineage === lineage && e.tier === tier);
  return rng.pick(pool).name;
}

function rollAccessory(rng: Rng, rareChance: number): string {
  const rare = rng.chance(rareChance);
  return rng.pick(ACCESSORIES.filter((a) => a.rare === rare)).name;
}

function rollItem(rng: Rng, rareChance: number): string {
  const rare = rng.chance(rareChance);
  return rng.pick(ITEMS.filter((i) => i.rare === rare)).name;
}

// ───────────────────────── マップ ─────────────────────────

export function choices(run: RunState): MapNode[] {
  return nextChoices(run.map, run.current);
}

export function moveTo(run: RunState, nodeId: string): MapNode {
  if (!choices(run).some((n) => n.id === nodeId)) throw new Error('そのマスには進めません');
  run.current = nodeId;
  run.visited.push(nodeId);
  return findNode(run.map, nodeId);
}

export function encounterFor(run: RunState, node: MapNode): { enemies: string[]; kind: BattleKind } {
  const rng = rngOf(run);
  const table = ENCOUNTERS[run.floor];
  if (!table) throw new Error(`${run.floor}層の敵はまだ作られていません`);
  if (node.type === 'boss') return { enemies: rng.pick(table.boss), kind: 'boss' };
  if (node.type === 'elite') return { enemies: rng.pick(table.elite), kind: 'elite' };
  const early = node.row < Math.floor(run.map.rows / 2) - 1;
  return { enemies: rng.pick(early ? table.early : table.late), kind: 'normal' };
}

// ───────────────────────── 戦闘の報酬 ─────────────────────────

export interface Rewards {
  exp: number;
  gold: number;
  drops: InvEntry[];
  levelUps: { name: string; level: number }[];
}

/** 戦闘後：経験値とお金を渡し、拾える物を抽選する（拾うかどうかは画面で選ぶ） */
export function battleRewards(run: RunState, kind: BattleKind, exp: number, gold: number): Rewards {
  const rng = rngOf(run);
  run.gold += gold;
  run.log.battles++;
  if (kind === 'elite') run.log.elites++;
  const levelUps: Rewards['levelUps'] = [];
  for (const c of run.party) {
    const ups = gainExp(c, exp);
    if (ups > 0) levelUps.push({ name: c.name, level: c.level });
  }
  const bookUp = partyMods(run).some((m) => m.bookDropUp) ? 0.2 : 0;
  const tier = Math.max(0, run.floor - 1);
  const drops: InvEntry[] = [];
  if (kind === 'normal') {
    if (rng.chance(0.35)) drops.push({ kind: 'item', name: rollItem(rng, 0.05) });
    if (rng.chance(0.3 + bookUp)) drops.push({ kind: 'book', name: rollBook(run, rng, BALANCE.rareChance.normal, 0.5) });
    if (rng.chance(0.12)) drops.push({ kind: 'equip', name: rollEquipment(run, rng, tier) });
    if (rng.chance(0.06)) drops.push({ kind: 'acc', name: rollAccessory(rng, 0.05) });
  } else if (kind === 'elite') {
    drops.push({ kind: 'book', name: rollBook(run, rng, BALANCE.rareChance.elite, 0.6) });
    if (rng.chance(bookUp)) drops.push({ kind: 'book', name: rollBook(run, rng, BALANCE.rareChance.elite, 0.6) });
    if (rng.chance(0.6)) drops.push({ kind: 'equip', name: rollEquipment(run, rng, tier + 1) });
    if (rng.chance(0.5)) drops.push({ kind: 'acc', name: rollAccessory(rng, 0.2) });
    drops.push({ kind: 'item', name: rollItem(rng, 0.2) });
  } else {
    drops.push({ kind: 'book', name: rollBook(run, rng, 0.6, 0.6) });
    drops.push({ kind: 'acc', name: rollAccessory(rng, 0.35) });
    drops.push({ kind: 'equip', name: rollEquipment(run, rng, tier + 1) });
  }
  return { exp, gold, drops, levelUps };
}

// ───────────────────────── 休憩所・宝箱 ─────────────────────────

export function rest(run: RunState) {
  for (const c of run.party) {
    const st = characterStats(c);
    if (c.hp <= 0) c.hp = Math.round(st.hp * BALANCE.restRatio);
    else c.hp = Math.min(st.hp, c.hp + Math.round(st.hp * BALANCE.restRatio));
    c.mp = Math.min(st.mp, c.mp + Math.round(st.mp * BALANCE.restRatio));
  }
}

export function fullRecover(run: RunState) {
  for (const c of run.party) {
    const st = characterStats(c);
    c.hp = st.hp;
    c.mp = st.mp;
  }
}

export function treasure(run: RunState): { gold: number; drops: InvEntry[] } {
  const rng = rngOf(run);
  const gold = rng.int(15, 30);
  run.gold += gold;
  const drops: InvEntry[] = [{ kind: 'item', name: rollItem(rng, 0.15) }];
  if (rng.chance(0.3)) drops.push({ kind: 'acc', name: rollAccessory(rng, 0.1) });
  else drops.push({ kind: 'item', name: rollItem(rng, 0.1) });
  return { gold, drops };
}

// ───────────────────────── ショップ ─────────────────────────

export interface ShopStock {
  nodeId: string;
  goods: { entry: InvEntry; sold: boolean }[];
}

export function openShop(run: RunState): ShopStock {
  if (run.shop && run.shop.nodeId === run.current) return run.shop;
  const rng = rngOf(run);
  const goods: InvEntry[] = [];
  const books = new Set<string>();
  while (books.size < 4) books.add(rollBook(run, rng, BALANCE.rareChance.shop, BALANCE.shopPartyJobRatio));
  for (const b of books) goods.push({ kind: 'book', name: b });
  const tier = Math.max(0, run.floor - 1);
  goods.push({ kind: 'equip', name: rollEquipment(run, rng, tier) });
  goods.push({ kind: 'equip', name: rollEquipment(run, rng, tier + 1) });
  goods.push({ kind: 'acc', name: rollAccessory(rng, 0.1) });
  goods.push({ kind: 'acc', name: rollAccessory(rng, 0.1) });
  goods.push({ kind: 'item', name: '薬草' });
  goods.push({ kind: 'item', name: '魔力の水' });
  for (let i = 0; i < 3; i++) goods.push({ kind: 'item', name: rollItem(rng, 0.1) });
  run.shop = { nodeId: run.current ?? '', goods: goods.map((entry) => ({ entry, sold: false })) };
  return run.shop;
}

export function buy(run: RunState, index: number): string | null {
  const g = run.shop?.goods[index];
  if (!g || g.sold) return '売り切れです';
  const price = buyPrice(run, g.entry);
  if (run.gold < price) return 'お金が足りません';
  if (inventoryFull(run)) return '持ち物がいっぱいです';
  run.gold -= price;
  g.sold = true;
  run.inventory.push(g.entry);
  return null;
}

export function sell(run: RunState, index: number): number {
  const e = removeFromInventory(run, index);
  const price = sellPrice(run, e);
  run.gold += price;
  return price;
}

// ───────────────────────── 本・装備 ─────────────────────────

/** 本を読んで技を覚える。枠がいっぱいなら forget の技を忘れる（戻らない） */
export function learnBook(run: RunState, invIndex: number, charId: string, forget?: string): string | null {
  const e = run.inventory[invIndex];
  if (!e || e.kind !== 'book') return '本ではありません';
  const c = run.party.find((x) => x.id === charId);
  if (!c) return 'キャラクターがいません';
  const s = SKILL_BY_NAME.get(e.name)!;
  if (s.job !== c.job) return `${s.job}の本です`;
  if (c.skills.includes(s.name)) return 'すでに覚えています';
  if (c.skills.length >= skillSlots(c)) {
    if (!forget || !c.skills.includes(forget)) return 'スキル枠がいっぱいです。忘れる技を選んでください';
    c.skills = c.skills.filter((x) => x !== forget);
  }
  c.skills.push(s.name);
  removeFromInventory(run, invIndex);
  return null;
}

export function equipmentDef(name: string): EquipmentDef {
  const d = EQUIPMENT.find((e) => e.name === name);
  if (!d) throw new Error(`装備「${name}」がありません`);
  return d;
}

/** 持ち物の装備・アクセサリーを付ける。外したものは持ち物に戻る */
export function equip(run: RunState, invIndex: number, charId: string, accSlot: 0 | 1 = 0): string | null {
  const e = run.inventory[invIndex];
  const c = run.party.find((x) => x.id === charId);
  if (!e || !c) return '対象がありません';
  if (e.kind === 'equip') {
    const d = equipmentDef(e.name);
    if (JOB_BY_NAME.get(c.job)!.lineage !== d.lineage) return `${d.lineage}の装備です`;
    removeFromInventory(run, invIndex);
    const old = d.slot === 'weapon' ? c.weapon : c.armor;
    if (d.slot === 'weapon') c.weapon = d.name;
    else c.armor = d.name;
    if (old) run.inventory.push({ kind: 'equip', name: old });
  } else if (e.kind === 'acc') {
    removeFromInventory(run, invIndex);
    const old = c.accessories[accSlot];
    c.accessories[accSlot] = e.name;
    if (old) run.inventory.push({ kind: 'acc', name: old });
  } else return '装備できません';
  clampVitals(c);
  return null;
}

export function unequipAccessory(run: RunState, charId: string, slot: 0 | 1): string | null {
  const c = run.party.find((x) => x.id === charId);
  if (!c || !c.accessories[slot]) return '外すものがありません';
  if (inventoryFull(run)) return '持ち物がいっぱいです';
  run.inventory.push({ kind: 'acc', name: c.accessories[slot]! });
  c.accessories[slot] = null;
  clampVitals(c);
  return null;
}

// ───────────────────────── アイテム（戦闘外） ─────────────────────────

export function fieldUsable(itemName: string): boolean {
  const it = ITEM_BY_NAME.get(itemName)!;
  return it.effects.every((e) => ['heal', 'mpHeal', 'revive', 'cure', 'restAll', 'levelUp'].includes(e.kind));
}

export function useFieldItem(run: RunState, invIndex: number, charId?: string): string | null {
  const e = run.inventory[invIndex];
  if (!e || e.kind !== 'item') return 'アイテムではありません';
  const it = ITEM_BY_NAME.get(e.name)!;
  if (!fieldUsable(it.name)) return '戦闘中にしか使えません';
  const targets = it.target === 'allyAll' || it.effects.some((x) => x.kind === 'restAll') ? run.party : run.party.filter((c) => c.id === charId);
  if (targets.length === 0) return '対象を選んでください';
  const reviving = it.effects.some((x) => x.kind === 'revive');
  if (it.target === 'ally' && !reviving && targets[0].hp <= 0) return '戦闘不能のキャラには使えません';
  if (reviving && targets[0].hp > 0) return '戦闘不能のキャラにしか使えません';
  const healOnly = it.effects.every((x) => x.kind === 'heal');
  if (healOnly && targets.every((c) => c.hp <= 0 || c.hp >= characterStats(c).hp)) return 'HPは満タンです';
  for (const c of targets) {
    const st = characterStats(c);
    for (const x of it.effects) {
      if (x.kind === 'restAll') rest(run);
      if (x.kind === 'levelUp') {
        levelUp(c);
        c.exp = 0;
      }
      if (x.kind === 'revive' && c.hp <= 0) c.hp = Math.max(1, Math.round(st.hp * (x.hp === 'tiny' ? 0.1 : x.hp === 'normal' ? 0.3 : 1)));
      if (c.hp <= 0) continue;
      if (x.kind === 'heal') c.hp = Math.min(st.hp, c.hp + (x.size === 'full' ? st.hp : BALANCE.fixedHeal[x.size]));
      if (x.kind === 'mpHeal') c.mp = Math.min(st.mp, c.mp + (x.size === 'full' ? st.mp : BALANCE.mpHeal[x.size]));
    }
  }
  removeFromInventory(run, invIndex);
  return null;
}

// ───────────────────────── 層クリア・仲間 ─────────────────────────

export function makeRecruits(run: RunState): Character[] {
  const rng = rngOf(run);
  const level = run.party.find((c) => c.isHero)!.level;
  const jobs = rng.sample(JOBS, 3);
  return jobs.map((j) => {
    const c = createCharacter(j.name, level, false, j.name);
    const books = starterBooks(j.name);
    c.skills.push(rng.pick(books));
    starterGear(c);
    c.row = j.role === 'タンク' || j.lineage === '剣士系' ? 'front' : 'back';
    return c;
  });
}

export function bossCleared(run: RunState) {
  fullRecover(run);
  run.recruits = makeRecruits(run);
}

export function recruit(run: RunState, index: number | null) {
  if (index !== null && run.recruits?.[index]) {
    const c = run.recruits[index];
    // 名前がかぶったら番号をつける
    const same = run.party.filter((p) => p.job === c.job).length;
    if (same > 0) c.name = `${c.job}${same + 1}`;
    run.party.push(c);
  }
  run.recruits = undefined;
  if (run.floor >= LAST_PLAYABLE_FLOOR) {
    run.result = 'demoClear';
    return;
  }
  run.floor++;
  run.current = null;
  run.visited = [];
  run.shop = undefined;
  run.map = generateMap(rngOf(run));
}

export function isPartyDead(run: RunState) {
  return run.party.every((c) => c.hp <= 0);
}

/** 戦闘からランの持ち物・お金を操作するための接続口 */
export function battleHooks(run: RunState, rng: Rng = rngOf(run)): BattleHooks {
  return {
    rng,
    getGold: () => run.gold,
    addGold: (n) => {
      run.gold = Math.max(0, run.gold + n);
    },
    addItem: (n) => addToInventory(run, { kind: 'item', name: n }),
    removeItem: (n) => removeItemByName(run, n),
    breakAccessory: (c, n) => {
      const i = c.accessories.indexOf(n);
      if (i >= 0) c.accessories[i] = null;
    },
  };
}

// ───────────────────────── 保存 ─────────────────────────

const SAVE_KEY = 'roguepg-save-v1';

export function saveRun(run: RunState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch {
    // 保存できない環境（プライベートモードなど）では何もしない
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    return run.version === 1 && !run.result ? run : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 何もしない
  }
}
