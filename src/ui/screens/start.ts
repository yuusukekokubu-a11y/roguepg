// タイトル・職業選択・最初の本の選択。

import { ARCHETYPES, JOBS, JOB_BY_NAME, SKILL_BY_NAME } from '../../data';
import { jobStats } from '../../engine/character';
import { clearSave, loadRun, newRun, starterBooks } from '../../engine/run';
import { STATS, STAT_LABEL } from '../../engine/types';
import { resumeScreen, type App } from '../app';
import { floorBackground, icon, jobArt } from '../art';
import { ask, choose, h } from '../dom';
import { skillLine, traitLine } from '../describe';
import { ASCENSION_TEXT, MAX_ASCENSION } from '../../data/ascension';
import { unlockedAscension } from '../../engine/progress';

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
            h(
              'div',
              { class: 'jname' },
              j.name,
              h('small', null, `${j.lineage}・${j.role}`),
              unlockedAscension(j.name) > 0 ? h('span', { class: 'asc-chip', title: '解放済みのアセンション' }, `A${unlockedAscension(j.name)}`) : null,
            ),
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

/** 職業ごとに、最後に選んだアセンションの段を覚えておく（はじめは解放済みの一番上） */
const chosenAsc = new Map<string, number>();

/** アセンションの段を選ぶ行 */
function ascensionPicker(job: string, rerender: () => void) {
  const max = unlockedAscension(job);
  if (max === 0) return h('p', { class: 'asc-note' }, `${job}でクリアすると、アセンション（一段上の難しさ）が解放される`);
  const lv = Math.min(max, chosenAsc.get(job) ?? max);
  const set = (n: number) => {
    chosenAsc.set(job, Math.max(0, Math.min(max, n)));
    rerender();
  };
  return h(
    'div',
    { class: 'asc-picker' },
    h('span', { class: 'asc-label' }, 'アセンション'),
    h('button', { class: 'btn small', disabled: lv <= 0, onclick: () => set(lv - 1) }, '◀'),
    h('b', { class: 'asc-num' }, lv === 0 ? '通常' : `${lv}`),
    h('button', { class: 'btn small', disabled: lv >= max, onclick: () => set(lv + 1) }, '▶'),
    h('small', { class: 'muted' }, `解放 ${max}/${MAX_ASCENSION}`),
    h(
      'button',
      {
        class: 'btn small',
        disabled: lv === 0,
        onclick: () =>
          choose(
            `アセンション${lv}の条件`,
            ASCENSION_TEXT.slice(0, lv).map((t, i) => ({ label: `${i + 1}. ${t}`, value: i })),
            '上の段は、下の段の条件をすべて引き継ぐ。',
          ),
      },
      '条件',
    ),
    lv > 0 ? h('p', { class: 'asc-note' }, `${lv}段：${ASCENSION_TEXT[lv - 1]}${lv > 1 ? ` ほか${lv - 1}つ` : ''}`) : null,
  );
}

export function starterScreen(app: App, screen: { job: string }) {
  const job = JOB_BY_NAME.get(screen.job)!;
  const books = starterBooks(job.name);
  const root = h('div', { class: 'screen' });
  const render = () => root.replaceChildren(...starterContent(app, job, books, render));
  render();
  return root;
}

function starterContent(app: App, job: NonNullable<ReturnType<typeof JOB_BY_NAME.get>>, books: string[], rerender: () => void): HTMLElement[] {
  const asc = Math.min(unlockedAscension(job.name), chosenAsc.get(job.name) ?? unlockedAscension(job.name));
  return [
    h('div', { class: 'map-head' }, h('h2', null, '最初に覚える技'), h('button', { class: 'btn small', onclick: () => app.go({ name: 'jobs' }) }, 'もどる')),
    h(
      'div',
      { class: 'win' },
      h('div', { class: 'char-head' }, jobArt(job.name, 56), h('div', null, h('h3', null, job.name), h('p', null, `${job.lineage}・${job.role}　${job.comment}`), traitLine(job.name))),
      ascensionPicker(job.name, rerender),
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
                app.run = newRun(job.name, name, undefined, asc);
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
  ];
}
