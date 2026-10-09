// ラン（1回の挑戦）全体の状態と、マップ上での出来事（報酬・ショップ・休憩所・仲間加入など）。
// RunState は JSON にそのまま保存できる形にしている。

import { ACCESSORIES, ACCESSORY_BY_NAME, ARCHETYPES, ITEMS, ITEM_BY_NAME, JOBS, JOB_BY_NAME, SKILLS, SKILL_BY_NAME } from '../data';
import { BLESSINGS, BLESSING_BY_NAME } from '../data/blessings';
import { ENCOUNTERS, ENEMY_BY_NAME } from '../data/enemies';
import { VARIANTS, VARIANT_CHANCE } from '../data/variants';
import { REPLACED_BOOKS } from '../data/jobTraits';
import { CURSE_POOL, ascensionRules } from '../data/ascension';
import { EQUIPMENT, MAX_TIER, type EquipmentDef } from '../data/equipment';
import { BALANCE } from './balance';
import { characterMods, characterStats, clampVitals, createCharacter, gainExp, levelUp, skillSlots, type Character } from './character';
import { generateMap, nextChoices, findNode, type FloorMap, type MapNode } from './map';
import { Rng } from './rng';
import type { BattleHooks, BattleKind } from './battle';
import type { Stat } from './types';

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
  /** 仲間の候補（ラン開始時の2人目、または1・2層のボス撃破後） */
  recruits?: Character[];
  /** 3層ボス撃破後の加護の候補 */
  blessingChoices?: string[];
  /** 受けている加護 */
  blessings?: string[];
  /** アセンションの段（0 = 通常） */
  ascension?: number;
  /** このランで起きたイベント（同じイベントは二度起きない） */
  seenEvents?: string[];
  result?: 'dead' | 'clear';
}

/** 最後の層（魔王の城） */
export const FINAL_FLOOR = 4;
/** パーティーの最大人数 */
export const MAX_PARTY = 4;

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

function starterGear(c: Character, tier = 0) {
  const lineage = JOB_BY_NAME.get(c.job)!.lineage;
  c.weapon = EQUIPMENT.find((e) => e.lineage === lineage && e.slot === 'weapon' && e.tier === tier)!.name;
  c.armor = EQUIPMENT.find((e) => e.lineage === lineage && e.slot === 'armor' && e.tier === tier)!.name;
  const st = characterStats(c);
  c.hp = st.hp;
  c.mp = st.mp;
}

export function newRun(job: string, starterBook: string, seed = Math.floor(Math.random() * 2 ** 31), ascension = 0): RunState {
  const hero = createCharacter(job, 1, true, '主人公');
  hero.skills.push(starterBook);
  starterGear(hero);
  const asc = ascensionRules(ascension);
  const run: RunState = {
    version: 1,
    seed,
    rngState: seed,
    floor: 1,
    map: { rows: 0, cols: 0, nodes: [] },
    current: null,
    visited: [],
    party: [hero],
    gold: Math.round(BALANCE.startGold * asc.startGoldMul),
    ascension,
    inventory: [
      { kind: 'item', name: '薬草' },
      { kind: 'item', name: '薬草' },
    ],
    log: { battles: 0, kills: 0, elites: 0 },
  };
  run.map = generateMap(rngOf(run), asc.eliteWeightMul);
  // 10段：主人公が外せない呪いのアクセサリーを着けて始まる
  if (asc.cursed) {
    hero.accessories[0] = rngOf(run).pick(CURSE_POOL);
    hero.cursed = hero.accessories[0];
  }
  offerPartner(run);
  return run;
}

/** このランのアセンションの条件 */
export function rules(run: RunState) {
  return ascensionRules(run.ascension ?? 0);
}

// ───────────────────────── 持ち物 ─────────────────────────

export function inventoryLimit(run: RunState): number {
  return BALANCE.inventoryLimit + run.party.reduce((a, c) => a + characterMods(c).reduce((b, m) => b + (m.inventoryPlus ?? 0), 0), 0);
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
  return run.party.flatMap((c) => characterMods(c));
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
  return Math.max(1, Math.round(basePrice(e) * rules(run).priceMul * (1 - Math.min(0.5, discount))));
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

/**
 * 普通の戦闘・宝箱で出る装備の段階＝その層の数字（4層は3）。強敵・ショップの上の品は +1。
 * 最初の装備は段階0、仲間は「前の層で拾える段階」で加わるので、拾った装備は必ず誰かの強化になりうる
 */
export function dropTier(run: RunState): number {
  return Math.min(MAX_TIER - 1, run.floor);
}

function rollEquipment(run: RunState, rng: Rng, tier: number): string {
  // パーティーの系統の装備が出やすい
  const lineages = run.party.map((c) => JOB_BY_NAME.get(c.job)!.lineage);
  const lineage = rng.chance(0.7) ? rng.pick(lineages) : rng.pick(['剣士系', '魔法系', '技巧系', '支援系'] as const);
  const pool = EQUIPMENT.filter((e) => e.lineage === lineage && e.tier === Math.min(MAX_TIER, tier));
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

export interface Encounter {
  enemies: string[];
  kind: BattleKind;
  /** 変異個体（enemies と同じ並び。null は普通の個体） */
  variants: (string | null)[];
}

export function encounterFor(run: RunState, node: MapNode): Encounter {
  const rng = rngOf(run);
  const table = ENCOUNTERS[run.floor];
  if (!table) throw new Error(`${run.floor}層の敵はまだ作られていません`);
  const list = node.type === 'boss' ? table.boss : node.type === 'elite' ? table.elite : node.row < Math.floor(run.map.rows / 2) - 1 ? table.early : table.late;
  const enemies = rng.pick(list);
  const kind: BattleKind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'normal';
  // 普通の敵は、ときどき変異個体になる
  const chance = (VARIANT_CHANCE[run.floor] ?? 0) * rules(run).variantMul;
  const variants = enemies.map((n) => (ENEMY_BY_NAME.get(n)?.kind === 'normal' && rng.chance(chance) ? rng.pick(VARIANTS).id : null));
  return { enemies, kind, variants };
}

// ───────────────────────── 戦闘の報酬 ─────────────────────────

/** 報酬の選択：options から1つ選ぶ（選ばなくてもよい） */
export interface RewardPick {
  title: string;
  options: InvEntry[];
}

export interface Rewards {
  exp: number;
  gold: number;
  picks: RewardPick[];
  levelUps: { name: string; level: number }[];
}

type Kind = InvEntry['kind'];

/** 種類の重みに従って、名前がかぶらない候補を n 個作る */
function rollOptions(run: RunState, rng: Rng, n: number, weights: [Kind, number][], opts: { rare: number; tier: number; partyRatio?: number }): InvEntry[] {
  const out: InvEntry[] = [];
  opts = { ...opts, rare: opts.rare * rules(run).rareMul };
  for (let tries = 0; out.length < n && tries < 50; tries++) {
    const kind = rng.weighted(weights);
    const name =
      kind === 'book'
        ? rollBook(run, rng, opts.rare, opts.partyRatio ?? 0.6)
        : kind === 'equip'
          ? rollEquipment(run, rng, opts.tier)
          : kind === 'acc'
            ? rollAccessory(rng, opts.rare)
            : rollItem(rng, opts.rare);
    if (!out.some((e) => e.name === name)) out.push({ kind, name });
  }
  return out;
}

/** 戦闘後：経験値とお金を渡し、報酬の選択肢を作る */
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
  // 目利きの眼鏡：本の候補が1つ増える
  const bookUp = partyMods(run).some((m) => m.bookDropUp);
  const tier = dropTier(run);
  const picks: RewardPick[] = [];
  if (kind === 'normal') {
    const options = rollOptions(run, rng, 3, [['book', 45], ['item', 25], ['equip', 20], ['acc', 10]], { rare: BALANCE.rareChance.normal, tier });
    if (bookUp) options.push(...rollOptions(run, rng, 1, [['book', 1]], { rare: BALANCE.rareChance.normal, tier }));
    picks.push({ title: '戦利品を1つ選ぶ', options });
  } else if (kind === 'elite') {
    picks.push({
      title: '強敵の戦利品を1つ選ぶ',
      options: rollOptions(run, rng, bookUp ? 4 : 3, [['book', 50], ['equip', 30], ['item', 20]], { rare: BALANCE.rareChance.elite, tier: tier + 1 }),
    });
    picks.push({ title: 'アクセサリーを1つ選ぶ', options: rollOptions(run, rng, 2, [['acc', 1]], { rare: 0.25, tier }) });
  } else {
    picks.push({ title: '秘伝の書を1つ選ぶ', options: rollOptions(run, rng, 3, [['book', 1]], { rare: 0.6, tier, partyRatio: 0.8 }) });
    picks.push({ title: 'アクセサリーを1つ選ぶ', options: rollOptions(run, rng, 3, [['acc', 1]], { rare: 0.35, tier }) });
  }
  return { exp, gold, picks, levelUps };
}

// ───────────────────────── 休憩所・宝箱 ─────────────────────────

export function rest(run: RunState) {
  const ratio = BALANCE.restRatio * rules(run).restMul;
  for (const c of run.party) {
    const st = characterStats(c);
    if (c.hp <= 0) c.hp = Math.round(st.hp * ratio);
    else c.hp = Math.min(st.hp, c.hp + Math.round(st.hp * ratio));
    c.mp = Math.min(st.mp, c.mp + Math.round(st.mp * ratio));
  }
}

export function fullRecover(run: RunState) {
  for (const c of run.party) {
    const st = characterStats(c);
    c.hp = st.hp;
    c.mp = st.mp;
  }
}

export function treasure(run: RunState): { gold: number; picks: RewardPick[] } {
  const rng = rngOf(run);
  const gold = rng.int(15, 30) * run.floor;
  run.gold += gold;
  const tier = dropTier(run);
  const options = rollOptions(run, rng, 3, [['acc', 40], ['item', 40], ['equip', 20]], { rare: 0.15, tier });
  return { gold, picks: [{ title: '宝箱の中身を1つ選ぶ', options }] };
}

// ───────────────────────── 休憩所で鍛える ─────────────────────────

/** 鍛えたときに上がる量（層が深いほど大きい） */
export function trainOptions(run: RunState): { stat: Stat; amount: number }[] {
  const n = run.floor;
  return [
    { stat: 'atk', amount: n + 1 },
    { stat: 'def', amount: n + 1 },
    { stat: 'mag', amount: n + 1 },
    { stat: 'spr', amount: n + 1 },
    { stat: 'spd', amount: Math.ceil(n / 2) },
    { stat: 'hp', amount: n * 3 + 2 },
  ];
}

/** 休憩所で鍛える：1人の能力値を永久に上げる */
export function train(run: RunState, charId: string, stat: Stat) {
  const c = run.party.find((x) => x.id === charId);
  const opt = trainOptions(run).find((o) => o.stat === stat);
  if (!c || !opt) throw new Error('鍛えられません');
  c.bonus = { ...(c.bonus ?? {}), [stat]: (c.bonus?.[stat] ?? 0) + opt.amount };
  if (stat === 'hp' && c.hp > 0) c.hp += opt.amount;
}

// ───────────────────────── ショップ ─────────────────────────

export interface ShopStock {
  nodeId: string;
  /** 本の取り寄せを使ったか */
  ordered?: boolean;
  /** 取り寄せた本（まだ受け取っていないもの） */
  orderOptions?: InvEntry[];
  goods: { entry: InvEntry; sold: boolean }[];
}

export function openShop(run: RunState): ShopStock {
  if (run.shop && run.shop.nodeId === run.current) return run.shop;
  const rng = rngOf(run);
  const goods: InvEntry[] = [];
  const books = new Set<string>();
  const rareMul = rules(run).rareMul;
  while (books.size < 4) books.add(rollBook(run, rng, BALANCE.rareChance.shop * rareMul, BALANCE.shopPartyJobRatio));
  for (const b of books) goods.push({ kind: 'book', name: b });
  const tier = dropTier(run);
  goods.push({ kind: 'equip', name: rollEquipment(run, rng, tier) });
  goods.push({ kind: 'equip', name: rollEquipment(run, rng, tier + 1) });
  goods.push({ kind: 'acc', name: rollAccessory(rng, 0.1 * rareMul) });
  goods.push({ kind: 'acc', name: rollAccessory(rng, 0.1 * rareMul) });
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

/** 技を忘れさせる値段 */
export const forgetPrice = (run: RunState) => 15 * run.floor;

/** 技を忘れる。price を省くとショップの値段（休憩所・イベントでは 0） */
export function forgetSkill(run: RunState, charId: string, skill: string, price = forgetPrice(run)): string | null {
  const c = run.party.find((x) => x.id === charId);
  if (!c || !c.skills.includes(skill)) return 'その技は覚えていません';
  if (run.gold < price) return 'お金が足りません';
  run.gold -= price;
  c.skills = c.skills.filter((x) => x !== skill);
  return null;
}

/** 技の枠を1つ増やす（上限まで） */
export function addSkillSlot(run: RunState, charId: string): string | null {
  const c = run.party.find((x) => x.id === charId);
  if (!c) return 'キャラクターがいません';
  if ((c.slotBonus ?? 0) >= BALANCE.maxSlotBonus) return 'これ以上は増やせない';
  c.slotBonus = (c.slotBonus ?? 0) + 1;
  return null;
}

/** 本の取り寄せの値段 */
export const orderPrice = (run: RunState) => 30 + 20 * run.floor;

/** 本の取り寄せ：職業を指定すると、その職業の本が3冊出る（1店につき1回） */
export function orderBooks(run: RunState, job: string): InvEntry[] | string {
  if (!run.shop) return '店がありません';
  if (run.shop.ordered) return 'この店ではもう取り寄せた';
  if (run.gold < orderPrice(run)) return 'お金が足りません';
  const rng = rngOf(run);
  run.gold -= orderPrice(run);
  run.shop.ordered = true;
  const books = rng.sample(
    SKILLS.filter((s) => s.job === job && !s.rare),
    3,
  ).map((s) => ({ kind: 'book' as const, name: s.name }));
  // たまにレア本が混ざる
  if (rng.chance(0.2)) books[2] = { kind: 'book', name: rng.pick(SKILLS.filter((s) => s.job === job && s.rare)).name };
  run.shop.orderOptions = books;
  return books;
}

export function sell(run: RunState, index: number): number {
  const e = removeFromInventory(run, index);
  const price = sellPrice(run, e);
  run.gold += price;
  return price;
}

// ───────────────────────── 本・装備 ─────────────────────────

/** 本を読んで技を覚える。枠がいっぱいなら forget の技を忘れる（戻らない） */
/** 技の枠がいっぱいのときの案内 */
export const SLOTS_FULL = '技の枠がいっぱい。ショップ・休憩所・一部のイベントで技を忘れさせてから読もう';

export function learnBook(run: RunState, invIndex: number, charId: string): string | null {
  const e = run.inventory[invIndex];
  if (!e || e.kind !== 'book') return '本ではありません';
  const c = run.party.find((x) => x.id === charId);
  if (!c) return 'キャラクターがいません';
  const s = SKILL_BY_NAME.get(e.name)!;
  if (s.job !== c.job) return `${s.job}の本です`;
  if (c.skills.includes(s.name)) return 'すでに覚えています';
  if (c.skills.length >= skillSlots(c)) return SLOTS_FULL;
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
    if (c.cursed && accSlot === 0) return '呪われていて付け替えられない';
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
  if (c.cursed && slot === 0) return '呪われていて外せない';
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

/** 仲間の候補。装備は「いまの層（＝加わる前の層）で拾える段階」。ラン開始の相棒は段階0 */
export function makeRecruits(run: RunState, gearTier = dropTier(run)): Character[] {
  const rng = rngOf(run);
  const level = run.party.find((c) => c.isHero)!.level;
  const jobs = rng.sample(JOBS, 3);
  return jobs.map((j) => {
    const c = createCharacter(j.name, level, false, j.name);
    const books = starterBooks(j.name);
    c.skills.push(rng.pick(books));
    // 加入する層に合わせた装備を持ってくる（2層に来る仲間は段階1の装備）
    starterGear(c, gearTier);
    c.row = j.role === 'タンク' || j.lineage === '剣士系' ? 'front' : 'back';
    return c;
  });
}

export function bossCleared(run: RunState) {
  // 8段からは半分だけ回復（倒れた仲間は起き上がる）
  const heal = rules(run).bossHeal;
  if (heal >= 1) fullRecover(run);
  else
    for (const c of run.party) {
      const st = characterStats(c);
      c.hp = Math.min(st.hp, c.hp + Math.round(st.hp * heal));
      c.mp = Math.min(st.mp, c.mp + Math.round(st.mp * heal));
    }
  if (run.floor >= FINAL_FLOOR) {
    run.result = 'clear';
    return;
  }
  // パーティーが4人そろっていたら（3層クリア時）、仲間の代わりに加護を選ぶ
  if (run.party.length >= MAX_PARTY) {
    run.blessingChoices = rngOf(run)
      .sample(BLESSINGS.filter((b) => !run.blessings?.includes(b.name)), 3)
      .map((b) => b.name);
    return;
  }
  run.recruits = makeRecruits(run);
}

function addMember(run: RunState, index: number | null) {
  if (index !== null && run.recruits?.[index]) {
    const c = run.recruits[index];
    // 名前がかぶったら番号をつける
    const same = run.party.filter((p) => p.job === c.job).length;
    if (same > 0) c.name = `${c.job}${same + 1}`;
    run.party.push(c);
  }
  run.recruits = undefined;
}

/** ラン開始時の2人目の候補を作る */
export function offerPartner(run: RunState) {
  run.recruits = makeRecruits(run, 0);
}

/** ラン開始時の2人目を決める（層は進まない） */
export function choosePartner(run: RunState, index: number) {
  addMember(run, index);
}

/** ボス撃破後の仲間加入 → 次の層へ */
export function recruit(run: RunState, index: number | null) {
  addMember(run, index);
  nextFloor(run);
}

/** 3層クリアの加護を選ぶ → 次の層へ */
export function chooseBlessing(run: RunState, name: string) {
  if (!run.blessingChoices?.includes(name)) throw new Error('その加護は選べません');
  run.blessings = [...(run.blessings ?? []), name];
  run.blessingChoices = undefined;
  nextFloor(run);
}

function nextFloor(run: RunState) {
  run.floor++;
  run.current = null;
  run.visited = [];
  run.shop = undefined;
  run.map = generateMap(rngOf(run), rules(run).eliteWeightMul);
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
    blessings: (run.blessings ?? []).map((n) => BLESSING_BY_NAME.get(n)!.mod),
    ascension: run.ascension ?? 0,
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

/** 名前が変わった本を、古いセーブの中でも新しい名前に直す */
function migrateNames(run: RunState) {
  const rename = (n: string) => REPLACED_BOOKS[n]?.name ?? n;
  for (const c of [...run.party, ...(run.recruits ?? [])]) c.skills = c.skills.map(rename);
  for (const e of run.inventory) if (e.kind === 'book') e.name = rename(e.name);
  for (const g of run.shop?.goods ?? []) if (g.entry.kind === 'book') g.entry.name = rename(g.entry.name);
  for (const e of run.shop?.orderOptions ?? []) if (e.kind === 'book') e.name = rename(e.name);
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.version !== 1 || run.result) return null;
    migrateNames(run);
    return run;
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
