// タイトル・職業選択・最初の本の選択。

import { ARCHETYPES, JOBS, JOB_BY_NAME, SKILL_BY_NAME } from '../../data';
import { jobStats } from '../../engine/character';
import { clearSave, loadRun, newRun, starterBooks } from '../../engine/run';
import { STATS, STAT_LABEL } from '../../engine/types';
import type { App } from '../app';
import { h } from '../dom';
import { skillLine } from '../describe';

export function titleScreen(app: App) {
  const saved = loadRun();
  return h(
    'div',
    { class: 'screen title' },
    h('h1', null, '⚔️ ローグ・パーティー'),
    h('p', { class: 'subtitle' }, 'その場の出会いと拾い物で、毎回ちがうパーティーを組み上げる'),
    h(
      'div',
      { class: 'title-buttons' },
      saved
        ? h(
            'button',
            {
              class: 'primary big',
              onclick: () => {
                app.run = saved;
                app.go({ name: 'map' });
              },
            },
            `つづきから（${saved.floor}層・${JOB_BY_NAME.get(saved.party[0].job)?.icon ?? ''}${saved.party[0].job} Lv${saved.party[0].level}）`,
          )
        : null,
      h(
        'button',
        {
          class: saved ? 'big' : 'primary big',
          onclick: () => {
            if (saved && !confirm('いまのランを捨てて、はじめから遊びますか？')) return;
            clearSave();
            app.go({ name: 'jobs' });
          },
        },
        'はじめから',
      ),
    ),
    h(
      'div',
      { class: 'panel howto' },
      h('h3', null, '遊び方'),
      h(
        'ul',
        null,
        h('li', null, '主人公の職業を選んで、分かれ道のマップを進みます。'),
        h('li', null, 'HP・MPは戦闘のあとも持ち越し。休憩所・アイテムで回復します。'),
        h('li', null, '拾ったスキルブックを読むと技を覚えます（職業ごとに読める本が決まっています）。'),
        h('li', null, '層のボスを倒すと、3人の候補から仲間を1人選べます。'),
        h('li', null, '全滅したら最初からやり直し。引き継ぐものはありません。'),
        h('li', { class: 'muted' }, '※ 試作版：いまは1層（草原）まで遊べます。'),
      ),
    ),
  );
}

const GRADE_CLASS: Record<string, string> = { '◎': 'g3', '○': 'g2', '△': 'g1', '×': 'g0' };

export function jobsScreen(app: App) {
  return h(
    'div',
    { class: 'screen' },
    h('div', { class: 'screen-head' }, h('button', { class: 'ghost', onclick: () => app.go({ name: 'title' }) }, '← もどる'), h('h2', null, '主人公の職業を選ぶ')),
    h('p', { class: 'muted' }, '◎とても得意 ○普通 △やや苦手 ×苦手。主人公に特別な補正はありません。'),
    h(
      'div',
      { class: 'job-grid' },
      JOBS.map((j) => {
        const st = jobStats(j.name, 1);
        return h(
          'button',
          { class: 'job-card', onclick: () => app.go({ name: 'starter', job: j.name }) },
          h('div', { class: 'job-name' }, h('span', { class: 'icon' }, j.icon), j.name, h('small', null, `${j.lineage}・${j.role}`)),
          h(
            'div',
            { class: 'grades' },
            STATS.map((s) => h('span', { class: `grade ${GRADE_CLASS[j.grades[s]]}`, title: `${STAT_LABEL[s]} ${st[s]}` }, h('b', null, STAT_LABEL[s]), j.grades[s])),
          ),
          h('div', { class: 'muted small' }, j.comment),
          h('div', { class: 'archetypes' }, ARCHETYPES.filter((a) => a.job === j.name).map((a) => h('span', { class: 'tag' }, a.name))),
        );
      }),
    ),
  );
}

export function starterScreen(app: App, screen: { job: string }) {
  const job = JOB_BY_NAME.get(screen.job)!;
  const books = starterBooks(job.name);
  return h(
    'div',
    { class: 'screen' },
    h('div', { class: 'screen-head' }, h('button', { class: 'ghost', onclick: () => app.go({ name: 'jobs' }) }, '← もどる'), h('h2', null, `${job.icon} ${job.name}：最初に覚える技`)),
    h('p', { class: 'muted' }, 'どの方向性から始めるかを選びます。ほかの本はダンジョンで集めましょう。'),
    h(
      'div',
      { class: 'choice-cards' },
      books.map((name) => {
        const s = SKILL_BY_NAME.get(name)!;
        const arch = ARCHETYPES.find((a) => a.job === job.name && a.name === s.archetype)!;
        return h(
          'button',
          {
            class: 'card choice-card',
            onclick: () => {
              app.run = newRun(job.name, name);
              app.save();
              app.go({ name: 'map' });
            },
          },
          h('div', { class: 'tag' }, arch.name),
          h('h3', null, `📘 ${s.name}`),
          h('p', null, skillLine(s)),
          h('p', { class: 'muted small' }, `方向性：${arch.description}`),
        );
      }),
    ),
  );
}
