// 報酬・宝箱・ショップ・休憩所・イベント・仲間加入・加護・ランの結果。
// どの画面も「帯 → パーティー → 場面の絵 → 中身（窓の中でスクロール）→ 決定ボタン」の並び。

import { FLOORS, JOBS, SKILL_BY_NAME } from '../../data';
import { BLESSING_BY_NAME } from '../../data/blessings';
import { BALANCE } from '../../engine/balance';
import { characterStats } from '../../engine/character';
import { choiceDisabled, choiceLabel, eventText, eventTitle, resolveChoice, type EventPick } from '../../engine/events';
import {
  addToInventory,
  buy,
  buyPrice,
  chooseBlessing,
  choosePartner,
  clearSave,
  inventoryLimit,
  removeFromInventory,
  recruit,
  rest,
  train,
  trainOptions,
  forgetPrice,
  forgetSkill,
  orderBooks,
  orderPrice,
  sell,
  sellPrice,
  type RewardPick,
  type Rewards,
} from '../../engine/run';
import { STATS, STAT_LABEL } from '../../engine/types';
import { resumeScreen, type App } from '../app';
import { entryIcon, floorBackground, icon, jobArt } from '../art';
import { ask, choose, h, toast } from '../dom';
import { entryDetail, entryTitle, isRare, skillLine, traitLine } from '../describe';
import type { IconName } from '../pixel/icons';
import { partyGrid, topBar } from './party';

/** 場面の絵：層の背景の上に、主役のドット絵を並べる */
function scene(floor: number, actors: HTMLElement[], kind?: { icon: IconName; label: string }) {
  return h(
    'div',
    { class: 'scene' },
    h('img', { class: 'px bg', src: floorBackground(floor), alt: '' }),
    kind ? h('div', { class: 'kind' }, icon(kind.icon, 12), kind.label) : null,
    h('div', { class: 'actors' }, actors),
  );
}

/** 報酬の選択：組ごとに候補から1つ選ぶ。選んだ物は持ち物に入る */
interface PickState {
  pick: RewardPick;
  chosen: string | null;
  skipped: boolean;
}

function picksBlock(app: App, states: PickState[], rerender: () => void) {
  const run = app.run!;
  return states.map((st) => {
    const done = st.chosen !== null || st.skipped;
    return h(
      'div',
      { class: 'pick-group' },
      h('div', { class: 'section-title' }, st.pick.title),
      done
        ? h('p', { class: 'taken' }, st.chosen ? `「${st.chosen}」を手に入れた` : '何も取らなかった')
        : h(
            'div',
            { class: 'reward-options' },
            st.pick.options.map((e) =>
              h(
                'button',
                {
                  class: `reward-card ${isRare(e) ? 'rare' : ''}`,
                  onclick: () => {
                    if (!addToInventory(run, e)) return toast('持ち物がいっぱい。下の持ち物から捨てて空きを作ろう');
                    st.chosen = e.name;
                    app.save();
                    rerender();
                  },
                },
                entryIcon(e, 24),
                h('div', { class: 'name' }, entryTitle(e)),
                h('div', { class: 'desc' }, entryDetail(e)),
              ),
            ),
            h(
              'button',
              {
                class: 'btn small',
                onclick: () => {
                  st.skipped = true;
                  rerender();
                },
              },
              '取らない',
            ),
          ),
    );
  });
}

/** 今の持ち物（空きを作るために捨てられる） */
function inventoryList(app: App, rerender: () => void) {
  const run = app.run!;
  if (run.inventory.length === 0) return h('p', { class: 'muted small' }, '何も持っていない');
  return h(
    'ul',
    { class: 'list' },
    run.inventory.map((e, i) =>
      h(
        'li',
        { class: isRare(e) ? 'rare' : '' },
        entryIcon(e, 18),
        h('div', null, h('div', { class: 'name' }, entryTitle(e)), h('div', { class: 'desc' }, entryDetail(e))),
        h(
          'button',
          {
            class: 'btn small danger',
            onclick: async () => {
              if (!(await ask(`${e.name} を捨てる？`, '捨てる'))) return;
              removeFromInventory(run, i);
              app.save();
              rerender();
            },
          },
          '捨てる',
        ),
      ),
    ),
  );
}

/** 報酬の選択と持ち物を1つの窓に並べる */
function pickupWindow(app: App, states: PickState[], rerender: () => void) {
  const run = app.run!;
  return h(
    'div',
    { class: 'win grow scroll' },
    picksBlock(app, states, rerender),
    h('div', { class: 'section-title', style: 'margin-top:10px' }, `持ち物（${run.inventory.length}/${inventoryLimit(run)}）`),
    inventoryList(app, rerender),
  );
}

function leaveButton(label: string, states: PickState[], go: () => void) {
  return h(
    'button',
    {
      class: 'btn primary wide',
      onclick: async () => {
        const left = states.filter((s) => s.chosen === null && !s.skipped).length;
        if (left > 0 && !(await ask('まだ選んでいない報酬がある。何も取らずに進む？', '取らずに進む'))) return;
        go();
      },
    },
    label,
  );
}

export function rewardScreen(app: App, screen: { title: string; rewards: Rewards; boss: boolean }) {
  const run = app.run!;
  const root = h('div', { class: 'screen' });
  const r = screen.rewards;
  const states: PickState[] = r.picks.map((pick) => ({ pick, chosen: null, skipped: false }));
  const render = () => {
    root.replaceChildren(
      topBar(app, render),
      partyGrid(run),
      h(
        'div',
        { class: 'win' },
        h('div', { class: 'win-title' }, screen.title),
        h('p', { class: 'win-sub' }, `経験値 ${r.exp}　お金 ${r.gold}G`),
        r.levelUps.map((l) => h('p', { class: 'levelup' }, `${l.name} は Lv${l.level} になった`)),
        screen.boss ? h('p', { class: 'levelup' }, 'パーティー全員のHP・MPが全回復した') : null,
      ),
      pickupWindow(app, states, render),
      leaveButton(run.recruits ? '仲間を選ぶ' : run.blessingChoices ? '加護を選ぶ' : 'マップへ', states, () => {
        app.save();
        app.go(resumeScreen(run));
      }),
    );
  };
  render();
  return root;
}

export function lootScreen(app: App, screen: { title: string; text: string; picks: RewardPick[] }) {
  const run = app.run!;
  const root = h('div', { class: 'screen' });
  const states: PickState[] = screen.picks.map((pick) => ({ pick, chosen: null, skipped: false }));
  const render = () =>
    root.replaceChildren(
      topBar(app, render),
      partyGrid(run),
      h('div', { class: 'win' }, h('div', { class: 'char-head' }, icon('treasure', 36), h('div', null, h('div', { class: 'win-title' }, screen.title), h('p', { class: 'win-sub' }, screen.text)))),
      pickupWindow(app, states, render),
      leaveButton('マップへ', states, () => {
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
  let tab: 'buy' | 'sell' | 'service' = 'buy';
  const render = () => {
    const shop = run.shop!;
    root.replaceChildren(
      topBar(app, render),
      h(
        'div',
        { class: 'win' },
        h('div', { class: 'char-head' }, icon('shop', 40), h('div', null, h('div', { class: 'win-title' }, 'ショップ'), h('p', { class: 'win-sub' }, '「使わない本は買い取るよ。命あっての物種だ」'))),
      ),
      h(
        'div',
        { class: 'tabs' },
        h('button', { class: `tab ${tab === 'buy' ? 'active' : ''}`, onclick: () => ((tab = 'buy'), render()) }, '買う'),
        h('button', { class: `tab ${tab === 'sell' ? 'active' : ''}`, onclick: () => ((tab = 'sell'), render()) }, `売る（${run.inventory.length}）`),
        h('button', { class: `tab ${tab === 'service' ? 'active' : ''}`, onclick: () => ((tab = 'service'), render()) }, 'サービス'),
      ),
      h(
        'div',
        { class: 'win grow scroll' },
        tab === 'service'
          ? shopServices(app, render)
          : tab === 'buy'
          ? h(
              'ul',
              { class: 'list' },
              shop.goods.map((g, i) =>
                h(
                  'li',
                  { class: `${isRare(g.entry) ? 'rare' : ''} ${g.sold ? 'sold' : ''}` },
                  entryIcon(g.entry, 18),
                  h('div', null, h('div', { class: 'name' }, entryTitle(g.entry)), h('div', { class: 'desc' }, entryDetail(g.entry))),
                  g.sold
                    ? h('span', { class: 'taken' }, '売切')
                    : h(
                        'button',
                        {
                          class: 'btn small',
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
            )
          : run.inventory.length === 0
            ? h('p', { class: 'muted small' }, '売る物がない')
            : h(
                'ul',
                { class: 'list' },
                run.inventory.map((e, i) =>
                  h(
                    'li',
                    null,
                    entryIcon(e, 18),
                    h('div', null, h('div', { class: 'name' }, entryTitle(e)), h('div', { class: 'desc' }, entryDetail(e))),
                    h(
                      'button',
                      {
                        class: 'btn small',
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
          class: 'btn primary wide',
          onclick: () => {
            app.save();
            app.go({ name: 'map' });
          },
        },
        '店を出る',
      ),
    );
  };
  render();
  return root;
}

/** ショップのサービス：技を忘れさせる・本の取り寄せ */
function shopServices(app: App, rerender: () => void) {
  const run = app.run!;
  const shop = run.shop!;
  const forget = async () => {
    const who = await choose(
      'だれの技を忘れさせる？',
      run.party.map((c) => ({ label: c.isHero ? `主人公（${c.job}）` : c.name, value: c.id, disabled: c.skills.length === 0, note: c.skills.length === 0 ? '技がない' : undefined })),
    );
    if (!who) return;
    const c = run.party.find((x) => x.id === who)!;
    const sk = await choose(
      'どの技を忘れる？',
      c.skills.map((n) => ({ label: n, value: n, note: skillLine(SKILL_BY_NAME.get(n)!) })),
      '忘れた技は二度と戻らない。',
    );
    if (!sk) return;
    const err = forgetSkill(run, who, sk);
    toast(err ?? `「${sk}」を忘れた`);
    app.save();
    rerender();
  };
  const order = async () => {
    const jobs = [...new Set(run.party.map((c) => c.job))];
    const all = JOBS.map((j) => j.name);
    const job = await choose(
      'どの職業の本を取り寄せる？',
      [...jobs, ...all.filter((j) => !jobs.includes(j))].map((j) => ({ label: j, value: j, note: jobs.includes(j) ? 'パーティーにいる' : undefined })),
    );
    if (!job) return;
    const res = orderBooks(run, job);
    if (typeof res === 'string') toast(res);
    app.save();
    rerender();
  };
  return h(
    'div',
    { class: 'choice-list' },
    h(
      'button',
      { class: 'menu-item', disabled: run.gold < forgetPrice(run), onclick: forget },
      h('span', null, `技を忘れさせる（${forgetPrice(run)}G）`),
      h('small', null, '技の枠を空ける。忘れた技は戻らない'),
    ),
    h(
      'button',
      { class: 'menu-item', disabled: !!shop.ordered || run.gold < orderPrice(run), onclick: order },
      h('span', null, `本の取り寄せ（${orderPrice(run)}G）`),
      h('small', null, shop.ordered ? 'この店ではもう取り寄せた' : '職業を指定すると、その職業の本が3冊届く。1冊選べる'),
    ),
    shop.orderOptions?.length
      ? h(
          'div',
          { class: 'reward-options' },
          shop.orderOptions.map((e) =>
            h(
              'button',
              {
                class: `reward-card ${isRare(e) ? 'rare' : ''}`,
                onclick: () => {
                  if (!addToInventory(run, e)) return toast('持ち物がいっぱい');
                  shop.orderOptions = [];
                  toast(`「${e.name}」を受け取った`);
                  app.save();
                  rerender();
                },
              },
              entryIcon(e, 24),
              h('div', { class: 'name' }, entryTitle(e)),
              h('div', { class: 'desc' }, entryDetail(e)),
            ),
          ),
        )
      : null,
  );
}

export function restScreen(app: App) {
  const run = app.run!;
  const root = h('div', { class: 'screen' });
  let done: string | null = null;
  const pct = Math.round(BALANCE.restRatio * 100);
  const doTrain = async () => {
    const who = await choose(
      'だれを鍛える？',
      run.party.map((c) => ({ label: c.isHero ? `主人公（${c.job}）` : c.name, value: c.id, disabled: c.hp <= 0, note: c.hp <= 0 ? '戦闘不能' : undefined })),
    );
    if (!who) return;
    const stat = await choose(
      '何を鍛える？（ずっと続く）',
      trainOptions(run).map((o) => ({ label: `${STAT_LABEL[o.stat]} +${o.amount}`, value: o.stat })),
    );
    if (!stat) return;
    train(run, who, stat);
    const c = run.party.find((x) => x.id === who)!;
    done = `${c.isHero ? '主人公' : c.name}は焚き火のそばで黙々と鍛えた。${STAT_LABEL[stat]}が上がった。`;
    app.save();
    render();
  };
  const render = () =>
    root.replaceChildren(
      topBar(app, render),
      partyGrid(run),
      scene(run.floor, [icon('rest', 56)]),
      h(
        'div',
        { class: 'win grow' },
        h('div', { class: 'win-title' }, '休憩所'),
        h('p', { class: 'story' }, done ?? '消えかけた焚き火が、闇の中でかすかに揺れている。休むか、鍛えるか。どちらか一つだけ。'),
      ),
      done
        ? h(
            'button',
            {
              class: 'btn primary wide',
              onclick: () => {
                app.save();
                app.go({ name: 'map' });
              },
            },
            'マップへ',
          )
        : h(
            'div',
            { class: 'cards' },
            h(
              'button',
              {
                class: 'btn primary wide',
                onclick: () => {
                  rest(run);
                  done = '焚き火のそばで、つかの間の眠りについた。体が軽くなった。';
                  app.save();
                  render();
                },
              },
              `休む（HP・MP ${pct}%回復／倒れた仲間も復活）`,
            ),
            h('button', { class: 'btn wide', onclick: doTrain }, `鍛える（1人の能力値がずっと上がる）`),
          ),
    );
  render();
  return root;
}

const EVENT_KIND: Record<string, { icon: IconName; label: string } | undefined> = {
  pair: { icon: 'pair', label: 'ペアイベント' },
  job: { icon: 'job', label: '職業イベント' },
  floor: { icon: 'floor', label: 'この層のイベント' },
  general: undefined,
};

export function eventScreen(app: App, screen: { pick: EventPick }) {
  const run = app.run!;
  const pick = screen.pick;
  const ev = pick.event;
  const actors = pick.actorIds.map((id) => run.party.find((c) => c.id === id)!).filter(Boolean);
  const root = h('div', { class: 'screen' });
  const render = (outcome?: { text: string; battle?: string[] }) =>
    root.replaceChildren(
      topBar(app, () => render(outcome)),
      partyGrid(run),
      scene(run.floor, actors.length > 0 ? actors.map((c) => jobArt(c.job, 48)) : [icon('event', 48)], EVENT_KIND[ev.kind]),
      h(
        'div',
        { class: 'win grow scroll' },
        h('div', { class: 'win-title' }, eventTitle(run, pick)),
        h('p', { class: 'story' }, eventText(run, pick)),
        outcome
          ? h('p', { class: 'outcome' }, outcome.text)
          : h(
              'div',
              { class: 'choice-list', style: 'margin-top:6px' },
              ev.choices.map((_, i) => {
                const why = choiceDisabled(run, pick, i);
                return h(
                  'button',
                  {
                    class: 'menu-item',
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
              class: 'btn primary wide',
              onclick: () => (outcome.battle ? app.go({ name: 'battle', enemies: outcome.battle, kind: 'normal', boss: false }) : app.go({ name: 'map' })),
            },
            outcome.battle ? '戦闘へ' : 'マップへ',
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
    atStart ? null : topBar(app, undefined, { menu: false }),
    h(
      'div',
      { class: 'win' },
      h('div', { class: 'win-title' }, atStart ? '旅の相棒を1人選ぶ' : '仲間を1人選ぶ'),
      h('p', { class: 'win-sub' }, atStart ? '酒場の隅で、3人の冒険者がこちらを値踏みしている。' : `主人公と同じLv${run.party[0].level}で加わる。職業のかぶりもかまわない。`),
    ),
    h(
      'div',
      { class: 'win grow scroll' },
      h(
        'div',
        { class: 'cards' },
        cands.map((c, i) => {
          const st = characterStats(c);
          return h(
            'button',
            { class: 'pick-card', onclick: () => pickOne(i) },
            jobArt(c.job, 40),
            h('h3', null, c.job),
            traitLine(c.job),
            h('div', { class: 'stat-row' }, STATS.map((s) => h('span', null, h('b', null, STAT_LABEL[s]), st[s]))),
            h('p', null, c.skills.map((n) => `${n}：${skillLine(SKILL_BY_NAME.get(n)!)}`).join('\n')),
          );
        }),
      ),
    ),
    atStart ? '' : h('button', { class: 'btn wide', onclick: async () => (await ask('だれも仲間にしない？', '仲間にしない')) && pickOne(null) }, 'だれも選ばない'),
  );
}

export function blessingScreen(app: App) {
  const run = app.run!;
  const choices = (run.blessingChoices ?? []).map((n) => BLESSING_BY_NAME.get(n)!);
  return h(
    'div',
    { class: 'screen' },
    topBar(app, undefined, { menu: false }),
    partyGrid(run),
    scene(run.floor, [icon('blessing', 56)]),
    h('div', { class: 'win' }, h('div', { class: 'win-title' }, '加護を1つ選ぶ'), h('p', { class: 'win-sub' }, '炎竜の骸から、古の力が立ちのぼる。選んだ加護は全員に、旅の最後まで宿り続ける。')),
    h(
      'div',
      { class: 'win grow scroll' },
      h(
        'div',
        { class: 'choice-list' },
        choices.map((b) =>
          h(
            'button',
            {
              class: 'menu-item',
              onclick: () => {
                chooseBlessing(run, b.name);
                app.save();
                app.go({ name: 'map' });
              },
            },
            h('span', { class: 'gold-text' }, b.name),
            h('small', null, b.text),
          ),
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
    scene(
      run.floor,
      run.party.map((c) => jobArt(c.job, 40)),
    ),
    h(
      'div',
      { class: 'win grow scroll' },
      h('div', { class: 'win-title', style: `font-size:1.4rem;color:${dead ? 'var(--blood)' : 'var(--gold)'}` }, dead ? '全滅' : '魔王討伐'),
      h(
        'p',
        { class: 'story' },
        dead
          ? `${run.floor}層「${FLOORS[run.floor - 1].place}」で、パーティーは力尽きた。何も残らない。また最初から。`
          : '魔王は崩れ落ち、城に夜明けの光が差した。この旅で集った仲間の名は、長く語り継がれるだろう。',
      ),
      h(
        'ul',
        { class: 'howto', style: 'margin-top:8px' },
        h('li', null, `到達：${run.floor}層「${FLOORS[run.floor - 1].place}」`),
        h('li', null, `主人公：${hero.job} Lv${hero.level}`),
        h('li', null, `戦闘：${run.log.battles}回（強敵 ${run.log.elites}）／倒した敵：${run.log.kills}体`),
        h('li', null, `パーティー：${run.party.map((c) => `${c.isHero ? '主人公' : c.name} Lv${c.level}`).join('、')}`),
        run.blessings?.length ? h('li', null, `加護：${run.blessings.join('、')}`) : null,
      ),
    ),
    h(
      'button',
      {
        class: 'btn primary wide',
        onclick: () => {
          app.run = null;
          app.go({ name: 'title' });
        },
      },
      'タイトルへ',
    ),
  );
}
