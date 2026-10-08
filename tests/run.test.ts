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
