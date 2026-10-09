import { beforeEach, describe, expect, it } from 'vitest';
import { ACCESSORIES, ACCESSORY_BY_NAME } from '../src/data';
import { CURSE_POOL, MAX_ASCENSION, ascensionRules } from '../src/data/ascension';
import { characterStats } from '../src/engine/character';
import { recordClear, unlockedAscension } from '../src/engine/progress';
import { battleHooks, buyPrice, choosePartner, equip, newRun, unequipAccessory } from '../src/engine/run';
import { Battle } from '../src/engine/battle';

// テスト用の localStorage（ブラウザの保存場所の代わり）
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe('アセンション', () => {
  it('クリアすると、その職業の次の段だけが解放される', () => {
    expect(unlockedAscension('戦士')).toBe(0);
    expect(recordClear('戦士', 0)).toBe(1);
    expect(unlockedAscension('戦士')).toBe(1);
    expect(unlockedAscension('騎士')).toBe(0);
    // 下の段でクリアしても上は解放されない
    expect(recordClear('戦士', 0)).toBeNull();
    expect(recordClear('戦士', 1)).toBe(2);
  });

  it(`解放は ${MAX_ASCENSION} 段まで`, () => {
    for (let i = 0; i < 15; i++) recordClear('盗賊', unlockedAscension('盗賊'));
    expect(unlockedAscension('盗賊')).toBe(MAX_ASCENSION);
  });

  it('段が上がると敵が強く、ショップが高く、最初のお金が少なくなる', () => {
    const a0 = newRun('戦士', '強打', 21, 0);
    const a6 = newRun('戦士', '強打', 21, 6);
    choosePartner(a0, 0);
    choosePartner(a6, 0);
    expect(a6.gold).toBeLessThan(a0.gold);
    const e = { kind: 'item' as const, name: '薬草' };
    expect(buyPrice(a6, e)).toBeGreaterThan(buyPrice(a0, e));
    const b0 = new Battle(a0.party, ['森の大熊'], 'elite', battleHooks(a0));
    const b6 = new Battle(a6.party, ['森の大熊'], 'elite', battleHooks(a6));
    const foe = (b: Battle) => b.units.find((u) => u.side === 'enemy')!;
    expect(foe(b6).base.hp).toBeGreaterThan(foe(b0).base.hp);
    expect(ascensionRules(10).cursed).toBe(true);
  });

  it('10段は主人公が外せない呪いを着けて始まる。呪いは戦利品には出ない', () => {
    const run = newRun('戦士', '強打', 22, 10);
    const hero = run.party[0];
    expect(CURSE_POOL).toContain(hero.accessories[0]);
    expect(hero.cursed).toBe(hero.accessories[0]);
    expect(unequipAccessory(run, hero.id, 0)).not.toBeNull();
    run.inventory.push({ kind: 'acc', name: '魔素の指輪' });
    expect(equip(run, run.inventory.length - 1, hero.id, 0)).not.toBeNull();
    expect(ACCESSORY_BY_NAME.has(hero.accessories[0]!)).toBe(true);
    expect(ACCESSORIES.some((a) => CURSE_POOL.includes(a.name))).toBe(false);
    expect(characterStats(hero)).toBeTruthy();
  });
});
