import { describe, expect, it } from 'vitest';
import { ACCESSORIES, ITEMS, JOBS, SKILLS } from '../src/data';
import accessoriesJson from '../src/data/generated/accessories.json';
import { ACCESSORY_MODS } from '../src/data/accessoryMods';
import { ENEMIES, ENCOUNTERS } from '../src/data/enemies';
import { EQUIPMENT, LINEAGES } from '../src/data/equipment';
import { parseAction } from '../src/engine/parser';
import { starterBooks } from '../src/engine/run';

describe('企画書のデータ', () => {
  it('企画書どおりの数がそろっている', () => {
    expect(JOBS).toHaveLength(14);
    expect(SKILLS).toHaveLength(210);
    expect(SKILLS.filter((s) => s.rare)).toHaveLength(42);
    expect(ACCESSORIES).toHaveLength(66);
    expect(ACCESSORIES.filter((a) => a.rare)).toHaveLength(9);
    expect(ITEMS).toHaveLength(25);
  });

  it('すべての本・アイテムの効果が部品に分解できる', () => {
    for (const s of SKILLS) expect(s.effects.length, s.name).toBeGreaterThan(0);
    for (const i of ITEMS) expect(i.effects.length, i.name).toBeGreaterThan(0);
  });

  it('アクセサリーの効果が過不足なく定義されている', () => {
    const names = accessoriesJson.map((a) => a.name).sort();
    expect(Object.keys(ACCESSORY_MODS).sort()).toEqual(names);
  });

  it('敵の技がすべて読める', () => {
    for (const e of ENEMIES) for (const a of e.actions) expect(() => parseAction(a.effect), `${e.name}:${a.name}`).not.toThrow();
    for (const list of Object.values(ENCOUNTERS[1])) for (const g of list) for (const n of g) expect(ENEMIES.some((e) => e.name === n), n).toBe(true);
  });

  it('各職業に方向性3つぶんの最初の本がある', () => {
    for (const j of JOBS) expect(starterBooks(j.name)).toHaveLength(3);
  });

  it('各系統に4段階の武器・防具がある', () => {
    for (const l of LINEAGES)
      for (const slot of ['weapon', 'armor'])
        for (let t = 0; t < 4; t++) expect(EQUIPMENT.some((e) => e.lineage === l && e.slot === slot && e.tier === t), `${l}${slot}${t}`).toBe(true);
  });
});

describe('効果の読み取り', () => {
  it('組み合わせ・条件・継続ターンを読み取れる', () => {
    expect(parseAction('物理ダメージ中＋防御ダウン').effects.map((e) => e.kind)).toEqual(['damage', 'buff']);
    expect(parseAction('物理ダメージ大／自分のHPが低いほど威力アップ').conditions).toEqual(['selfHpLow']);
    const trap = parseAction('反撃＋毒（数ターン）').effects;
    expect(trap).toEqual([{ kind: 'counter', turns: 3, status: 'poison' }]);
    const sanctuary = parseAction('毎ターンHP回復＋状態異常を防ぐ（数ターン）').effects;
    expect(sanctuary.map((e) => e.kind)).toEqual(['tick', 'ward']);
    expect(parseAction('溜め：次のターンに物理ダメージ特大').effects[0].kind).toBe('delayed');
  });

  it('知らない言い回しはエラーにする', () => {
    expect(() => parseAction('すごいビーム')).toThrow();
  });
});
