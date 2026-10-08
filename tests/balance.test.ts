// 自動プレイで各職業がどの層まで行けるかを測る（バランスの目安）。
// 回数を増やすとき: RUNS=150 npx vitest run tests/balance.test.ts
import { describe, expect, it } from 'vitest';
import { JOBS } from '../src/data';
import { simulateRun } from '../src/engine/autoplay';

const RUNS = Number(process.env.RUNS ?? 40);

describe('バランス（自動プレイ）', () => {
  it('どの職業でも1層は越えられる可能性がある', () => {
    const rows: string[] = [];
    const failed: string[] = [];
    const total = [0, 0, 0, 0, 0];
    for (const job of JOBS) {
      // reach[n] = n層に到達した回数（5 = クリア）
      const reach = [0, 0, 0, 0, 0, 0];
      let lv = 0;
      for (let i = 0; i < RUNS; i++) {
        const r = simulateRun(job.name, 1000 + i * 7919);
        const end = r.cleared ? 5 : r.floor;
        for (let f = 1; f <= end; f++) reach[f]++;
        lv += r.level;
      }
      const pct = (n: number) => `${String(Math.round((n / RUNS) * 100)).padStart(3)}%`;
      rows.push(`${job.name.padEnd(6, '　')} 2層到達${pct(reach[2])} 3層${pct(reach[3])} 4層${pct(reach[4])} クリア${pct(reach[5])}  平均Lv ${(lv / RUNS).toFixed(1)}`);
      for (let f = 2; f <= 5; f++) total[f - 1] += reach[f];
      if (reach[2] === 0) failed.push(job.name);
    }
    const all = RUNS * JOBS.length;
    rows.push(`全体　　　　 2層到達${Math.round((total[1] / all) * 100)}% 3層${Math.round((total[2] / all) * 100)}% 4層${Math.round((total[3] / all) * 100)}% クリア${Math.round((total[4] / all) * 100)}%`);
    console.log(rows.join('\n'));
    expect(failed, '1層を一度も越えられない職業').toEqual([]);
  }, 300_000);
});
