import { describe, expect, it } from 'vitest';
import { JOBS } from '../src/data';
import { ENEMY_BY_NAME } from '../src/data/enemies';
import { createCharacter } from '../src/engine/character';
import { EVENTS, choiceDisabled, eventActors, eventText, eventTitle, pickEvent, resolveChoice, type EventPick } from '../src/engine/events';
import { newRun } from '../src/engine/run';

/** イベントの条件を満たすランを作る */
function runFor(jobs: string[], floor: number, seed = 1) {
  const run = newRun(jobs[0] ?? '戦士', '強打', seed);
  run.recruits = undefined;
  run.party = [];
  for (const [i, j] of (jobs.length > 0 ? jobs : ['戦士']).entries()) {
    const c = createCharacter(j, 5, i === 0);
    run.party.push(c);
  }
  run.floor = floor;
  run.gold = 999;
  return run;
}

describe('イベント', () => {
  it('種類ごとの数とidの重複', () => {
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(EVENTS.filter((e) => e.kind === 'job')).toHaveLength(14);
    expect(EVENTS.filter((e) => e.kind === 'pair')).toHaveLength(12);
    for (const f of [1, 2, 3, 4]) expect(EVENTS.filter((e) => e.kind === 'floor' && e.floors?.includes(f)).length, `${f}層`).toBeGreaterThanOrEqual(2);
  });

  it('全職業に職業イベントがあり、ペアの職業名も正しい', () => {
    const names = JOBS.map((j) => j.name);
    for (const j of names) expect(EVENTS.some((e) => e.kind === 'job' && e.jobs?.[0] === j), j).toBe(true);
    for (const e of EVENTS) for (const j of e.jobs ?? []) expect(names, e.id).toContain(j);
  });

  it('すべてのイベントのすべての選択肢がエラーなく動く', () => {
    for (const ev of EVENTS) {
      for (const floor of ev.floors ?? [1, 4]) {
        ev.choices.forEach((_, i) => {
          for (let seed = 1; seed <= 6; seed++) {
            const run = runFor(ev.jobs ?? [], floor, seed);
            const actors = eventActors(run, ev);
            expect(actors, ev.id).not.toBeNull();
            const pick: EventPick = { event: ev, actorIds: actors!.map((a) => a.id) };
            expect(eventTitle(run, pick)).not.toBe('');
            expect(eventText(run, pick)).not.toBe('');
            if (choiceDisabled(run, pick, i)) continue;
            const out = resolveChoice(run, pick, i);
            expect(out.text, `${ev.id}#${i}`).not.toBe('');
            for (const n of out.battle ?? []) expect(ENEMY_BY_NAME.has(n), `${ev.id}: ${n}`).toBe(true);
            for (const c of run.party) expect(Number.isFinite(c.hp) && c.hp >= 0, ev.id).toBe(true);
          }
        });
      }
    }
  });

  it('条件を満たさないペアイベントは起きない', () => {
    const pair = EVENTS.find((e) => e.id === 'pair-white-black')!;
    expect(eventActors(runFor(['白魔道士', '戦士'], 1), pair)).toBeNull();
    expect(eventActors(runFor(['白魔道士', '黒魔道士'], 1), pair)?.map((c) => c.job)).toEqual(['白魔道士', '黒魔道士']);
  });

  it('同じイベントは1回のランで二度起きない', () => {
    const run = runFor(['白魔道士', '黒魔道士'], 1, 9);
    const seen: string[] = [];
    // この条件で起きうるのは11種類（いつでも6・層2・職業2・ペア1）。使い切るまでは重複しない
    for (let i = 0; i < 11; i++) seen.push(pickEvent(run).event.id);
    expect(new Set(seen).size).toBe(11);
    // 使い切ったあとも、いつでも起きるイベントで続けられる
    expect(pickEvent(run).event.kind).toBe('general');
  });

  it('ペアがそろっていると、ペアイベントが出やすい', () => {
    let hits = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const run = runFor(['白魔道士', '黒魔道士'], 1, seed);
      if (pickEvent(run).event.id === 'pair-white-black') hits++;
    }
    // 候補（いつでも6・層2・職業2・ペア1）の重みから、およそ2割
    expect(hits).toBeGreaterThan(20);
  });
});
