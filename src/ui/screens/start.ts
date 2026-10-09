// タイトル・職業選択・最初の本の選択。

import { ARCHETYPES, JOBS, JOB_BY_NAME, SKILL_BY_NAME } from '../../data';
import { jobStats } from '../../engine/character';
import { clearSave, loadRun, newRun, starterBooks } from '../../engine/run';
import { STATS, STAT_LABEL } from '../../engine/types';
import { resumeScreen, type App } from '../app';
import { floorBackground, icon, jobArt } from '../art';
import { ask, h } from '../dom';
import { skillLine, traitLine } from '../describe';

export function titleScreen(app: App) {
  const saved = loadRun();
  const bg = h('div', { class: 'title-bg' }, h('img', { class: 'px', src: floorBackground(1), alt: '' }));
  return h(
    'div',
    { class: 'screen title-screen' },
    bg,
    h(
      'div',
      { class: 'title-logo' },
      h('h1', null, 'ローグ・パーティー'),
      h('p', null, 'その場の出会いと拾い物で、毎回ちがうパーティーを組む'),
      h('div', { class: 'title-party' }, ['騎士', '黒魔道士', '盗賊', '白魔道士'].map((j) => jobArt(j, 40))),
    ),
    h(
      'div',
      { class: 'win' },
      saved
        ? h(
            'button',
            {
              class: 'menu-item sel',
              onclick: () => {
                app.run = saved;
                app.go(resumeScreen(saved));
              },
            },
            'つづきから',
            h('span', { class: 'note' }, `${saved.floor}層・${saved.party[0].job} Lv${saved.party[0].level}`),
          )
        : null,
      h(
        'button',
        {
          class: `menu-item ${saved ? '' : 'sel'}`,
          onclick: async () => {
            if (saved && !(await ask('いまのランを捨てて、はじめから遊ぶ？', 'はじめから遊ぶ'))) return;
            clearSave();
            app.go({ name: 'jobs' });
          },
        },
        'はじめから',
      ),
      h(
        'ul',
        { class: 'howto' },
        h('li', null, '職業を選び、分かれ道を進んで全4層の魔王の城を目指す'),
        h('li', null, 'HP・MPは持ち越し。休憩所やアイテムで回復する'),
        h('li', null, '本を読むと技を覚える。層のボスを倒すと仲間が増える'),
        h('li', { class: 'muted' }, '全滅したら最初から。引き継ぐものはない'),
      ),
    ),
  );
}

const GRADE_CLASS: Record<string, string> = { '◎': 'g3', '○': 'g2', '△': 'g1', '×': 'g0' };

export function jobsScreen(app: App) {
  return h(
    'div',
    { class: 'screen' },
    h('div', { class: 'map-head' }, h('h2', null, '主人公の職業'), h('button', { class: 'btn small', onclick: () => app.go({ name: 'title' }) }, 'もどる')),
    h('p', { class: 'win-sub' }, '◎とても得意 ○普通 △やや苦手 ×苦手。主人公に特別な補正はない。'),
    h(
      'div',
      { class: 'win grow scroll' },
      h(
        'div',
        { class: 'job-list' },
        JOBS.map((j) => {
          const st = jobStats(j.name, 1);
          return h(
            'button',
            { class: 'job-card', onclick: () => app.go({ name: 'starter', job: j.name }) },
            jobArt(j.name, 44),
            h('div', { class: 'jname' }, j.name, h('small', null, `${j.lineage}・${j.role}`)),
            h(
              'div',
              { class: 'grades' },
              STATS.map((s) => h('span', { class: `grade ${GRADE_CLASS[j.grades[s]]}`, title: `${STAT_LABEL[s]} ${st[s]}` }, h('b', null, STAT_LABEL[s]), j.grades[s])),
            ),
            h('div', { class: 'jdesc' }, `${j.comment}　`, ARCHETYPES.filter((a) => a.job === j.name).map((a) => a.name).join('／')),
            traitLine(j.name),
          );
        }),
      ),
    ),
  );
}

export function starterScreen(app: App, screen: { job: string }) {
  const job = JOB_BY_NAME.get(screen.job)!;
  const books = starterBooks(job.name);
  return h(
    'div',
    { class: 'screen' },
    h('div', { class: 'map-head' }, h('h2', null, '最初に覚える技'), h('button', { class: 'btn small', onclick: () => app.go({ name: 'jobs' }) }, 'もどる')),
    h(
      'div',
      { class: 'win' },
      h('div', { class: 'char-head' }, jobArt(job.name, 56), h('div', null, h('h3', null, job.name), h('p', null, `${job.lineage}・${job.role}　${job.comment}`), traitLine(job.name))),
    ),
    h('p', { class: 'win-sub' }, 'どの方向性から始めるかを選ぶ。ほかの本はダンジョンで集める。'),
    h(
      'div',
      { class: 'win grow scroll' },
      h(
        'div',
        { class: 'cards' },
        books.map((name) => {
          const s = SKILL_BY_NAME.get(name)!;
          const arch = ARCHETYPES.find((a) => a.job === job.name && a.name === s.archetype)!;
          return h(
            'button',
            {
              class: 'pick-card',
              onclick: () => {
                app.run = newRun(job.name, name);
                app.save();
                app.go({ name: 'recruit' });
              },
            },
            icon('book', 32),
            h('h3', null, s.name, h('span', { class: 'tag', style: 'margin-left:8px' }, arch.name)),
            h('p', null, skillLine(s)),
            h('p', null, `方向性：${arch.description}`),
          );
        }),
      ),
    ),
  );
}
