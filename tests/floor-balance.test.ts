// 層ごとのバランス測定（調整用・時間がかかるので普段は実行しない）
// 実行方法: FLOOR_SIM=1 npx vitest run tests/floor-balance.test.ts
// 開始レベルは L2 / L3 / L4 で変えられる（例: L2=6）
import { it } from 'vitest';
import { JOBS, SKILLS } from '../src/data';
import { playRun } from '../src/engine/autoplay';
import { characterStats, createCharacter } from '../src/engine/character';
import { generateMap } from '../src/engine/map';
import { newRun, rngOf } from '../src/engine/run';
import { EQUIPMENT } from '../src/data/equipment';
import { Rng } from '../src/engine/rng';

const LV: Record<number, number> = { 2: Number(process.env.L2 ?? 5), 3: Number(process.env.L3 ?? 9), 4: Number(process.env.L4 ?? 13) };
it.skipIf(!process.env.FLOOR_SIM)('各層をその層の想定パーティーで遊んだときの突破率', () => {
  const out: string[] = [];
  for (const floor of [2, 3, 4]) {
    let clear = 0; const N = 120; let lvEnd = 0; const hist: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const rng = new Rng(500 + i * 31);
      const run = newRun(rng.pick(JOBS).name, '強打' , 900 + i);
      run.party = [];
      for (let k = 0; k < floor; k++) {
        const job = rng.pick(JOBS).name;
        const c = createCharacter(job, LV[floor], k === 0);
        const lin = JOBS.find((j) => j.name === job)!.lineage;
        c.weapon = EQUIPMENT.find((e) => e.lineage === lin && e.slot === 'weapon' && e.tier === floor - 1)!.name;
        c.armor = EQUIPMENT.find((e) => e.lineage === lin && e.slot === 'armor' && e.tier === floor - 1)!.name;
        c.skills = rng.sample(SKILLS.filter((s) => s.job === job && !s.rare), Math.min(3 + floor - 2, 5)).map((s) => s.name);
        const st = characterStats(c); c.hp = st.hp; c.mp = st.mp;
        c.row = ['剣士系'].includes(lin) ? 'front' : 'back';
        run.party.push(c);
      }
      run.floor = floor; run.gold = 100 * floor;
      run.map = generateMap(rngOf(run));
      const r = playRun(run, rng, floor);
      if (r.cleared || run.floor > floor) clear++;
      else { const n = run.map.nodes.find((x) => x.id === run.current); hist[(n?.type ?? '?') + (n?.row ?? '')] = (hist[(n?.type ?? '?') + (n?.row ?? '')] ?? 0) + 1; }
      lvEnd += run.party[0].level;
    }
    out.push(`${floor}層 開始Lv${LV[floor]} 突破率 ${Math.round((clear / N) * 100)}% 終了時平均Lv ${(lvEnd / N).toFixed(1)} ${JSON.stringify(hist)}`);
  }
  console.log(out.join('\n'));
}, 600000);
