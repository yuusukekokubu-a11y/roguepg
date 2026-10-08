// 自動プレイで各職業の1層クリア率を測る（バランスの目安）。
import { describe, expect, it } from 'vitest';
import { JOBS } from '../src/data';
import { simulateRun } from '../src/engine/autoplay';

const RUNS = 40;

describe('1層のバランス（自動プレイ）', () => {
  it('どの職業でもクリアできる可能性がある', () => {
    const rows: string[] = [];
    const failed: string[] = [];
    for (const job of JOBS) {
      let clear = 0;
      let lv = 0;
      const died: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const r = simulateRun(job.name, 1000 + i * 7919);
        if (r.cleared) clear++;
        else died.push(r.diedAt);
        lv += r.level;
      }
      rows.push(`${job.name.padEnd(6, '　')} クリア率 ${String(Math.round((clear / RUNS) * 100)).padStart(3)}%  平均Lv ${(lv / RUNS).toFixed(1)}  倒れた段 ${died.join(',')}`);
      if (clear === 0) failed.push(job.name);
    }
    console.log(rows.join('\n'));
    expect(failed, '一度もクリアできない職業').toEqual([]);
  }, 120_000);
});
