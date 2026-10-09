import { describe, expect, it } from 'vitest';
import { BLESSINGS } from '../src/data/blessings';
import { Battle } from '../src/engine/battle';
import { battleHooks, bossCleared, chooseBlessing, choosePartner, newRun, recruit } from '../src/engine/run';

describe('ランの流れ', () => {
  it('ラン開始時に2人目の候補が3人出て、選ぶと2人パーティーになる', () => {
    const run = newRun('戦士', '強打', 42);
    expect(run.recruits).toHaveLength(3);
    expect(run.recruits!.every((c) => c.level === 1)).toBe(true);
    choosePartner(run, 1);
    expect(run.party).toHaveLength(2);
    expect(run.floor).toBe(1);
    expect(run.recruits).toBeUndefined();
  });

  it('1・2層クリアで仲間が増え、3層クリアでは加護を選ぶ', () => {
    const run = newRun('白魔道士', '癒しの光', 7);
    choosePartner(run, 0);
    bossCleared(run);
    recruit(run, 0);
    expect(run.floor).toBe(2);
    expect(run.party).toHaveLength(3);
    bossCleared(run);
    recruit(run, 0);
    expect(run.floor).toBe(3);
    expect(run.party).toHaveLength(4);
    bossCleared(run);
    expect(run.recruits).toBeUndefined();
    expect(run.blessingChoices).toHaveLength(3);
    chooseBlessing(run, run.blessingChoices![0]);
    expect(run.floor).toBe(4);
    expect(run.blessings).toHaveLength(1);
    bossCleared(run);
    expect(run.result).toBe('clear');
  });

  it('加護は戦闘中のパーティー全員に効く', () => {
    const run = newRun('戦士', '強打', 3);
    choosePartner(run, 0);
    const plain = new Battle(run.party, ['スライム'], 'normal', battleHooks(run));
    run.blessings = [BLESSINGS.find((b) => b.name === '勇者の加護')!.name];
    const blessed = new Battle(run.party, ['スライム'], 'normal', battleHooks(run));
    for (let i = 0; i < 2; i++) {
      expect(blessed.units[i].base.atk).toBeGreaterThan(plain.units[i].base.atk);
    }
  });

  it('再起の加護で、勝った戦闘のあと倒れた仲間が起き上がる', () => {
    const run = newRun('戦士', '強打', 5);
    choosePartner(run, 0);
    run.blessings = ['再起の加護'];
    run.party[1].hp = 0;
    const b = new Battle(run.party, ['スライム'], 'normal', battleHooks(run));
    b.units.filter((u) => u.side === 'enemy').forEach((u) => (u.hp = 0));
    b.phase = 'won';
    b.finish();
    expect(run.party[1].hp).toBeGreaterThan(0);
  });
});

describe('報酬・休憩所・ショップ', () => {
  it('普通の戦闘の報酬は3つの候補から選ぶ形', async () => {
    const { battleRewards } = await import('../src/engine/run');
    const run = newRun('戦士', '強打', 11);
    choosePartner(run, 0);
    const r = battleRewards(run, 'normal', 5, 5);
    expect(r.picks).toHaveLength(1);
    expect(r.picks[0].options).toHaveLength(3);
    expect(new Set(r.picks[0].options.map((o) => o.name)).size).toBe(3);
    const e = battleRewards(run, 'elite', 5, 5);
    expect(e.picks.map((p) => p.options.length)).toEqual([3, 2]);
  });

  it('休憩所で鍛えると能力値がずっと上がる', async () => {
    const { train } = await import('../src/engine/run');
    const { characterStats } = await import('../src/engine/character');
    const run = newRun('戦士', '強打', 12);
    const before = characterStats(run.party[0]).atk;
    train(run, run.party[0].id, 'atk');
    expect(characterStats(run.party[0]).atk).toBe(before + 2);
  });

  it('ショップで技を忘れさせ、本を取り寄せられる（取り寄せは1回だけ）', async () => {
    const { forgetSkill, openShop, orderBooks } = await import('../src/engine/run');
    const run = newRun('戦士', '強打', 13);
    run.gold = 999;
    run.current = 'x';
    openShop(run);
    expect(forgetSkill(run, run.party[0].id, '強打')).toBeNull();
    expect(run.party[0].skills).not.toContain('強打');
    const books = orderBooks(run, '黒魔道士');
    expect(Array.isArray(books) && books.length).toBe(3);
    expect(typeof orderBooks(run, '黒魔道士')).toBe('string');
  });
});

describe('敵の行動予告と変異個体', () => {
  it('敵は次の行動を予告し、その通りに動く', () => {
    const run = newRun('戦士', '強打', 14);
    const b = new Battle(run.party, ['牙イノシシ'], 'normal', battleHooks(run));
    const boar = b.units.find((u) => u.side === 'enemy')!;
    expect(b.describeIntent(boar)?.kind).toBe('buff');
    expect(boar.intent?.action.name).toBe('鼻を鳴らす');
  });

  it('変異個体は名前と強さが変わる', () => {
    const run = newRun('戦士', '強打', 15);
    const plain = new Battle(run.party, ['スライム'], 'normal', battleHooks(run));
    const giant = new Battle(run.party, ['スライム'], 'normal', battleHooks(run), ['giant']);
    const a = plain.units.find((u) => u.side === 'enemy')!;
    const g = giant.units.find((u) => u.side === 'enemy')!;
    expect(g.name).toBe('巨大なスライム');
    expect(g.base.hp).toBeGreaterThan(a.base.hp);
  });
});
