// 報酬・宝箱・ショップ・休憩所・イベント・仲間加入・ランの結果。

import { FLOORS, JOB_BY_NAME, SKILL_BY_NAME } from '../../data';
import { BLESSING_BY_NAME } from '../../data/blessings';
import { BALANCE } from '../../engine/balance';
import { characterStats } from '../../engine/character';
import { choiceDisabled, choiceLabel, eventText, eventTitle, resolveChoice, type EventPick } from '../../engine/events';
import {
  addToInventory,
  buy,
  buyPrice,
  clearSave,
  inventoryFull,
  chooseBlessing,
  choosePartner,
  recruit,
  rest,
  sell,
  sellPrice,
  type InvEntry,
  type Rewards,
} from '../../engine/run';
import { STATS, STAT_LABEL } from '../../engine/types';
import { resumeScreen, type App } from '../app';
import { ask, h, toast } from '../dom';
import { entryDetail, entryTitle, isRare, skillLine } from '../describe';
import { partyBar } from './party';

/** 拾える物の一覧（拾う・置いていく） */
function dropsList(app: App, drops: InvEntry[], rerender: () => void, taken: Set<number>) {
  const run = app.run!;
  if (drops.length === 0) return h('p', { class: 'muted' }, '拾える物はなかった。');
  return h(
    'ul',
    { class: 'inv-list' },
    drops.map((d, i) =>
      h(
        'li',
        { class: isRare(d) ? 'rare' : '' },
        h('div', null, h('b', null, entryTitle(d)), h('div', { class: 'muted small' }, entryDetail(d))),
        taken.has(i)
          ? h('span', { class: 'taken' }, '✔ 拾った')
          : h(
              'button',
              {
                class: 'tiny-btn primary',
                onclick: () => {
                  if (!addToInventory(run, d)) return toast('持ち物がいっぱいです。「パーティー・持ち物」から使うか捨ててください');
                  taken.add(i);
                  app.save();
                  rerender();
                },
              },
              inventoryFull(run) ? '拾う（満杯）' : '拾う',
            ),
      ),
    ),
  );
}

function leaveButton(label: string, drops: InvEntry[], taken: Set<number>, go: () => void) {
  return h(
    'button',
    {
      class: 'primary big',
      onclick: async () => {
        const left = drops.length - taken.size;
        if (left > 0 && !(await ask(`拾っていない物が${left}個あります。置いていきますか？`, '置いていく'))) return;
        go();
      },
    },
    label,
  );
}

export function rewardScreen(app: App, screen: { title: string; rewards: Rewards; boss: boolean }) {
  const root = h('div', { class: 'screen' });
  const taken = new Set<number>();
  const r = screen.rewards;
  const render = () => {
    root.replaceChildren(
      partyBar(app, render),
      h(
        'div',
        { class: 'panel center' },
        h('h2', null, screen.title),
        h('p', null, `経験値 ${r.exp}　お金 ${r.gold}G`),
        r.levelUps.map((l) => h('p', { class: 'levelup' }, `🎉 ${l.name} は Lv${l.level} になった！`)),
        screen.boss ? h('p', { class: 'levelup' }, '✨ パーティー全員のHP・MPが全回復した！') : null,
      ),
      h('div', { class: 'panel' }, h('h3', null, '拾える物'), dropsList(app, r.drops, render, taken)),
      leaveButton(app.run!.recruits ? '仲間を選ぶ →' : app.run!.blessingChoices ? '加護を選ぶ →' : 'マップへ →', r.drops, taken, () => {
        app.save();
        app.go(resumeScreen(app.run!));
      }),
    );
  };
  render();
  return root;
}

export function lootScreen(app: App, screen: { title: string; text: string; drops: InvEntry[] }) {
  const root = h('div', { class: 'screen' });
  const taken = new Set<number>();
  const render = () =>
    root.replaceChildren(
      partyBar(app, render),
      h('div', { class: 'panel center' }, h('h2', null, screen.title), h('p', null, screen.text)),
      h('div', { class: 'panel' }, dropsList(app, screen.drops, render, taken)),
      leaveButton('マップへ →', screen.drops, taken, () => {
        app.save();
        app.go({ name: 'map' });
      }),
    );
  render();
  return root;
}

export function shopScreen(app: App) {
  const run = app.run!;
  const root = h('div', { class: 'screen' });
  const render = () => {
    const shop = run.shop!;
    root.replaceChildren(
      partyBar(app, render),
      h('div', { class: 'panel center' }, h('h2', null, '🛒 ショップ'), h('p', { class: 'muted' }, '「いらっしゃい！ 使わない本は買い取るよ」')),
      h(
        'div',
        { class: 'panel' },
        h('h3', null, '買う'),
        h(
          'ul',
          { class: 'inv-list' },
          shop.goods.map((g, i) =>
            h(
              'li',
              { class: `${isRare(g.entry) ? 'rare' : ''} ${g.sold ? 'sold' : ''}` },
              h('div', null, h('b', null, entryTitle(g.entry)), h('div', { class: 'muted small' }, entryDetail(g.entry))),
              g.sold
                ? h('span', { class: 'taken' }, '売り切れ')
                : h(
                    'button',
                    {
                      class: 'tiny-btn primary',
                      disabled: run.gold < buyPrice(run, g.entry),
                      onclick: () => {
                        const err = buy(run, i);
                        if (err) toast(err);
                        app.save();
                        render();
                      },
                    },
                    `${buyPrice(run, g.entry)}G`,
                  ),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h3', null, '売る'),
        run.inventory.length === 0 ? h('p', { class: 'muted' }, '売る物がない') : null,
        h(
          'ul',
          { class: 'inv-list' },
          run.inventory.map((e, i) =>
            h(
              'li',
              null,
              h('div', null, h('b', null, entryTitle(e)), h('div', { class: 'muted small' }, entryDetail(e))),
              h(
                'button',
                {
                  class: 'tiny-btn',
                  onclick: () => {
                    const p = sell(run, i);
                    toast(`${e.name} を ${p}G で売った`);
                    app.save();
                    render();
                  },
                },
                `売る ${sellPrice(run, e)}G`,
              ),
            ),
          ),
        ),
      ),
      h(
        'button',
        {
          class: 'primary big',
          onclick: () => {
            app.save();
            app.go({ name: 'map' });
          },
        },
        '店を出る →',
      ),
    );
  };
  render();
  return root;
}

export function restScreen(app: App) {
  const run = app.run!;
  const root = h('div', { class: 'screen' });
  let rested = false;
  const pct = Math.round(BALANCE.restRatio * 100);
  const render = () =>
    root.replaceChildren(
      partyBar(app, render),
      h(
        'div',
        { class: 'panel center' },
        h('h2', null, '🔥 休憩所'),
        h('p', null, rested ? '焚き火で体を休めた。' : '焚き火がぱちぱちと燃えている。'),
        rested
          ? null
          : h(
              'button',
              {
                class: 'primary big',
                onclick: () => {
                  rest(run);
                  rested = true;
                  app.save();
                  render();
                },
              },
              `休む（HP・MPを最大の${pct}%回復、戦闘不能の仲間も復活）`,
            ),
      ),
      h(
        'button',
        {
          class: rested ? 'primary big' : 'big',
          onclick: () => {
            app.save();
            app.go({ name: 'map' });
          },
        },
        rested ? 'マップへ →' : '休まずに出発する',
      ),
    );
  render();
  return root;
}

const EVENT_KIND_LABEL: Record<string, string> = { pair: '💞 ペアイベント', job: '⭐ 職業イベント', floor: '🗺️ この層のイベント', general: '' };

export function eventScreen(app: App, screen: { pick: EventPick }) {
  const run = app.run!;
  const pick = screen.pick;
  const ev = pick.event;
  const actors = pick.actorIds.map((id) => run.party.find((c) => c.id === id)!).filter(Boolean);
  const root = h('div', { class: 'screen' });
  const render = (outcome?: { text: string; battle?: string[] }) =>
    root.replaceChildren(
      partyBar(app, () => render(outcome)),
      h(
        'div',
        { class: `panel center event ${ev.kind}` },
        EVENT_KIND_LABEL[ev.kind] ? h('div', { class: 'event-kind' }, EVENT_KIND_LABEL[ev.kind]) : '',
        h('div', { class: 'event-icon' }, ev.icon),
        actors.length > 0
          ? h('div', { class: 'event-actors' }, actors.map((c) => h('span', { class: 'tag' }, `${JOB_BY_NAME.get(c.job)!.icon} ${c.isHero ? '主人公' : c.name}`)))
          : '',
        h('h2', null, eventTitle(run, pick)),
        h('p', null, eventText(run, pick)),
        outcome
          ? h('p', { class: 'outcome' }, outcome.text)
          : h(
              'div',
              { class: 'choice-list' },
              ev.choices.map((_, i) => {
                const why = choiceDisabled(run, pick, i);
                return h(
                  'button',
                  {
                    class: 'choice',
                    disabled: !!why,
                    onclick: () => {
                      const out = resolveChoice(run, pick, i);
                      app.save();
                      render(out);
                    },
                  },
                  h('span', null, choiceLabel(run, pick, i)),
                  why ? h('small', null, why) : null,
                );
              }),
            ),
      ),
      outcome
        ? h(
            'button',
            {
              class: 'primary big',
              onclick: () => (outcome.battle ? app.go({ name: 'battle', enemies: outcome.battle, kind: 'normal', boss: false }) : app.go({ name: 'map' })),
            },
            outcome.battle ? '戦闘へ →' : 'マップへ →',
          )
        : '',
    );
  render();
  return root;
}

export function recruitScreen(app: App) {
  const run = app.run!;
  const cands = run.recruits ?? [];
  // ラン開始時の2人目（相棒）選び
  const atStart = run.party.length === 1 && run.floor === 1 && run.current === null;
  const pickOne = (i: number | null) => {
    if (atStart && i !== null) {
      choosePartner(run, i);
      app.save();
      app.go({ name: 'map' });
      return;
    }
    recruit(run, i);
    if (run.result) {
      clearSave();
      app.go({ name: 'end' });
    } else {
      app.save();
      app.go({ name: 'map' });
    }
  };
  return h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'panel center' },
      h('h2', null, atStart ? '🤝 旅の相棒を1人選ぶ' : '🤝 仲間を1人選ぶ'),
      h('p', { class: 'muted' }, atStart ? '酒場で3人の冒険者が声をかけてきた。いっしょに旅立つ1人を選ぼう。' : `主人公と同じLv${run.party[0].level}で加入します。職業のかぶりもOK。`),
    ),
    h(
      'div',
      { class: 'choice-cards' },
      cands.map((c, i) => {
        const job = JOB_BY_NAME.get(c.job)!;
        const st = characterStats(c);
        return h(
          'button',
          { class: 'card choice-card', onclick: () => pickOne(i) },
          h('h3', null, `${job.icon} ${job.name}`),
          h('div', { class: 'muted small' }, `${job.lineage}・${job.role}　${job.comment}`),
          h('div', { class: 'stat-row' }, STATS.map((s) => h('span', { class: 'stat' }, h('b', null, STAT_LABEL[s]), st[s]))),
          h('p', null, c.skills.map((n) => `📘 ${n}：${skillLine(SKILL_BY_NAME.get(n)!)}`).join('\n')),
        );
      }),
    ),
    atStart ? '' : h('button', { class: 'ghost', onclick: async () => (await ask('だれも仲間にしませんか？', '仲間にしない')) && pickOne(null) }, 'だれも選ばない'),
  );
}

export function blessingScreen(app: App) {
  const run = app.run!;
  const choices = (run.blessingChoices ?? []).map((n) => BLESSING_BY_NAME.get(n)!);
  return h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'panel center' },
      h('h2', null, '🌟 加護を1つ選ぶ'),
      h('p', { class: 'muted' }, '炎竜を倒したパーティーに、古の力が宿る。選んだ加護は全員に、旅の最後まで効き続ける。'),
    ),
    h(
      'div',
      { class: 'choice-cards' },
      choices.map((b) =>
        h(
          'button',
          {
            class: 'card choice-card blessing',
            onclick: () => {
              chooseBlessing(run, b.name);
              app.save();
              app.go({ name: 'map' });
            },
          },
          h('h3', null, `${b.icon} ${b.name}`),
          h('p', null, b.text),
        ),
      ),
    ),
  );
}

export function endScreen(app: App) {
  const run = app.run!;
  const dead = run.result === 'dead';
  const hero = run.party[0];
  return h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: `panel center end ${dead ? 'dead' : 'clear'}` },
      h('h1', null, dead ? '💀 ゲームオーバー' : '👑 魔王討伐！'),
      h(
        'p',
        null,
        dead
          ? `${run.floor}層「${FLOORS[run.floor - 1].place}」でパーティーは全滅した。何も引き継がず、最初からやり直しだ。`
          : '魔王は倒れ、城に光が戻った。この旅で集めた仲間とともに、伝説が語り継がれる。',
      ),
      h(
        'ul',
        { class: 'summary' },
        h('li', null, `到達：${run.floor}層「${FLOORS[run.floor - 1].place}」`),
        h('li', null, `主人公：${hero.job} Lv${hero.level}`),
        h('li', null, `戦闘回数：${run.log.battles}（強敵 ${run.log.elites}）`),
        h('li', null, `倒した敵：${run.log.kills}体`),
        h('li', null, `パーティー：${run.party.map((c) => `${JOB_BY_NAME.get(c.job)!.icon}${c.name} Lv${c.level}`).join('、')}`),
      ),
      h(
        'button',
        {
          class: 'primary big',
          onclick: () => {
            app.run = null;
            app.go({ name: 'title' });
          },
        },
        'タイトルへ',
      ),
    ),
  );
}
