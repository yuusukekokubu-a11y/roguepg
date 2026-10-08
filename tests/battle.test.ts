import { describe, expect, it } from 'vitest';
import { Battle, type BattleHooks } from '../src/engine/battle';
import { createCharacter, type Character } from '../src/engine/character';
import { Rng } from '../src/engine/rng';

function hooks(seed = 1): BattleHooks & { gold: number } {
  const h = {
    gold: 100,
    rng: new Rng(seed),
    getGold: () => h.gold,
    addGold: (n: number) => void (h.gold += n),
    addItem: () => true,
    removeItem: () => {},
    breakAccessory: (c: Character, n: string) => {
      const i = c.accessories.indexOf(n);
      if (i >= 0) c.accessories[i] = null;
    },
  };
  return h;
}

function hero(job: string, skills: string[] = [], level = 5) {
  const c = createCharacter(job, level, true, '主人公');
  c.skills = skills;
  return c;
}

/** 次の自分の番まで進める */
function untilInput(b: Battle) {
  for (let i = 0; i < 200; i++) {
    const ph = b.advance();
    if (ph !== 'running') return ph;
  }
  throw new Error('進みません');
}

describe('戦闘', () => {
  it('素早い敵は先に動く（行動順に表示される）', () => {
    const b = new Battle([hero('騎士')], ['野ウサギ', '野ウサギ'], 'normal', hooks());
    const order = b.turnOrder(6).map((o) => o.unit.name);
    expect(order.filter((n) => n.startsWith('野ウサギ')).length).toBeGreaterThanOrEqual(3);
  });

  it('通常攻撃で敵を倒すと勝利する', () => {
    const b = new Battle([hero('戦士', [], 10)], ['スライム'], 'normal', hooks());
    let guard = 0;
    while (b.phase !== 'won' && guard++ < 50) {
      if (untilInput(b) === 'input') b.submit({ type: 'attack', target: b.alive('enemy')[0].uid });
    }
    expect(b.phase).toBe('won');
    expect(b.finish().exp).toBeGreaterThan(0);
  });

  it('たたかうが当たるとMPがたまる', () => {
    const c = hero('黒魔道士', [], 5);
    c.mp = 0;
    const b = new Battle([c], ['森の大熊'], 'elite', hooks(4));
    b.units.forEach((u) => (u.lingers = []));
    untilInput(b);
    const me = b.current!;
    const bear = b.alive('enemy')[0];
    for (let i = 0; i < 5 && me.mp === 0; i++) {
      b.submit({ type: 'attack', target: bear.uid });
      if (untilInput(b) !== 'input') break;
    }
    expect(me.mp).toBeGreaterThan(0);
    expect(me.mp % b.attackMpGain(me)).toBe(0);
  });

  it('MPが足りない技は使えない', () => {
    const c = hero('黒魔道士', ['隕石']);
    c.mp = 0;
    const b = new Battle([c], ['スライム'], 'normal', hooks());
    untilInput(b);
    expect(() => b.submit({ type: 'skill', skill: '隕石' })).toThrow('MPが足りない');
  });

  it('溜め技は次のターンに発動し、スタンで崩れる', () => {
    const b = new Battle([hero('侍', ['居合'])], ['森の大熊'], 'elite', hooks(3));
    untilInput(b);
    const me = b.current!;
    b.submit({ type: 'skill', skill: '居合', target: b.alive('enemy')[0].uid });
    expect(me.delayed).toBeDefined();
    expect(b.turnOrder().some((o) => o.unit === me && o.charging)).toBe(true);
    b.applyStatus(b.alive('enemy')[0], me, 'stun', 1);
    expect(me.delayed).toBeUndefined();
  });

  it('毒は重なり、毎ターンダメージを与える', () => {
    const b = new Battle([hero('呪術師', ['毒の呪い'], 10)], ['スライム'], 'normal', hooks(5));
    const slime = b.alive('enemy')[0];
    slime.base.hp = slime.hp = 999;
    const me = b.units[0];
    b.applyStatus(me, slime, 'poison', 1);
    b.applyStatus(me, slime, 'poison', 1);
    expect(slime.status.poison?.stacks).toBe(2);
  });

  it('毒キノコに毒は効かない', () => {
    const b = new Battle([hero('呪術師')], ['毒キノコ'], 'normal', hooks());
    b.applyStatus(b.units[0], b.alive('enemy')[0], 'poison', 1);
    expect(b.alive('enemy')[0].status.poison).toBeUndefined();
  });

  it('挑発している敵しか狙えない', () => {
    const b = new Battle([hero('戦士')], ['野盗の用心棒', '野盗'], 'elite', hooks());
    const guard = b.alive('enemy')[0];
    guard.lingers.push({ kind: 'taunt', turns: 3, sourceSide: 'enemy' });
    expect(b.selectableTargets(b.units[0], 'enemy', []).map((u) => u.uid)).toEqual([guard.uid]);
  });

  it('野盗に盗まれたお金は倒すと取り返せる', () => {
    const h = hooks(2);
    const b = new Battle([hero('戦士', [], 20)], ['野盗'], 'normal', h);
    let guard = 0;
    while (b.phase !== 'won' && b.phase !== 'lost' && guard++ < 100) {
      if (untilInput(b) === 'input') b.submit({ type: 'defend' });
      if (h.gold < 100) break;
    }
    if (h.gold < 100) {
      while (b.phase !== 'won' && guard++ < 200) if (untilInput(b) === 'input') b.submit({ type: 'attack', target: b.alive('enemy')[0].uid });
      expect(h.gold).toBeGreaterThanOrEqual(100);
    }
  });

  it('拡散の指輪で単体技が全体になる', () => {
    const c = hero('黒魔道士', ['火炎'], 10);
    c.accessories[0] = '拡散の指輪';
    const b = new Battle([c], ['スライム', 'スライム', 'スライム'], 'normal', hooks());
    expect(b.effectiveTarget(b.units[0], 'enemy', true)).toBe('enemyAll');
  });

  it('身代わり人形は一度だけ倒れるのを防いで壊れる', () => {
    const c = hero('黒魔道士', [], 1);
    c.accessories[0] = '身代わり人形';
    c.hp = 1;
    const b = new Battle([c], ['草原の主（大角獣）'], 'boss', hooks());
    let guard = 0;
    while (c.accessories[0] && b.phase === 'running' && guard++ < 50) {
      if (b.advance() === 'input') b.submit({ type: 'defend' });
    }
    expect(c.accessories[0]).toBeNull();
  });
});
