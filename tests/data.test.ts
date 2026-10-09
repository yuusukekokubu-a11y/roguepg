import { describe, expect, it } from 'vitest';
import { ACCESSORIES, ITEMS, JOBS, SKILLS } from '../src/data';
import accessoriesJson from '../src/data/generated/accessories.json';
import enemiesJson from '../src/data/generated/enemies.json';
import { ACCESSORY_MODS } from '../src/data/accessoryMods';
import { ENEMIES, ENCOUNTERS } from '../src/data/enemies';
import { EQUIPMENT, LINEAGES } from '../src/data/equipment';
import { parseAction } from '../src/engine/parser';
import { starterBooks } from '../src/engine/run';

describe('企画書のデータ', () => {
  it('企画書どおりの数がそろっている', () => {
    expect(JOBS).toHaveLength(14);
    expect(SKILLS).toHaveLength(215);
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
  });

  it('企画書の「敵」シートの36体がすべている（追加の敵16体も）', () => {
    const KIND: Record<string, string> = { 通常: 'normal', 強敵: 'elite', ボス: 'boss' };
    expect(ENEMIES).toHaveLength(52);
    for (const row of enemiesJson) {
      const e = ENEMIES.find((x) => x.name === row.name);
      expect(e, row.name).toBeDefined();
      expect(`${e!.floor}層`, row.name).toBe(row.floor);
      expect(e!.kind, row.name).toBe(KIND[row.kind]);
    }
  });

  it('全4層の出現パターンに実在する敵だけがいる', () => {
    for (const floor of [1, 2, 3, 4]) {
      const table = ENCOUNTERS[floor];
      expect(table, `${floor}層`).toBeDefined();
      for (const list of Object.values(table))
        for (const g of list) for (const n of g) expect(ENEMIES.find((e) => e.name === n)?.floor, `${floor}層:${n}`).toBe(floor);
    }
  });

  it('パターン行動の技名がすべて定義されている', () => {
    for (const e of ENEMIES)
      for (const n of [...(e.pattern ?? []), ...(e.halfHp?.pattern ?? []), ...(e.enrage ? [e.enrage] : [])])
        expect(e.actions.some((a) => a.name === n), `${e.name}:${n}`).toBe(true);
  });

  it('各職業に方向性3つぶんの最初の本がある', () => {
    for (const j of JOBS) expect(starterBooks(j.name)).toHaveLength(3);
  });

  it('各系統に4段階の武器・防具がある', () => {
    for (const l of LINEAGES)
      for (const slot of ['weapon', 'armor'])
        for (let t = 0; t <= 4; t++) expect(EQUIPMENT.some((e) => e.lineage === l && e.slot === slot && e.tier === t), `${l}${slot}${t}`).toBe(true);
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

describe('職業の特性と追加の本', () => {
  it('全職業に特性があり、回復手段のなかった職業に回復系の本がある', async () => {
    const { JOB_TRAITS } = await import('../src/data/jobTraits');
    for (const j of JOBS) expect(JOB_TRAITS[j.name], j.name).toBeDefined();
    for (const job of ['侍', '黒魔道士', '呪術師', '盗賊', '狩人']) {
      const heals = SKILLS.filter((s) => s.job === job && s.effects.some((e) => e.kind === 'heal' || (e.kind === 'damage' && e.lifesteal)));
      expect(heals.length, job).toBeGreaterThan(0);
    }
  });
});
