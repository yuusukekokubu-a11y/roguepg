import './style.css';
import { createApp } from './ui/app';
import { battleScreen } from './ui/screens/battle';
import { mapScreen } from './ui/screens/map';
import { blessingScreen, endScreen, eventScreen, lootScreen, recruitScreen, restScreen, rewardScreen, shopScreen } from './ui/screens/misc';
import { jobsScreen, starterScreen, titleScreen } from './ui/screens/start';

const app = createApp(document.getElementById('app')!, {
  title: titleScreen,
  jobs: jobsScreen,
  starter: starterScreen,
  map: mapScreen,
  battle: battleScreen,
  reward: rewardScreen,
  loot: lootScreen,
  shop: shopScreen,
  rest: restScreen,
  event: eventScreen,
  recruit: recruitScreen,
  blessing: blessingScreen,
  end: endScreen,
});

// 選択カーソル（▶）は、同じメニューの中で最後に触った項目に1つだけ出す
const moveCursor = (e: Event) => {
  const item = (e.target as HTMLElement | null)?.closest?.('.menu-item');
  if (!(item instanceof HTMLButtonElement) || item.disabled || item.classList.contains('sel')) return;
  item.parentElement?.querySelectorAll(':scope > .menu-item.sel').forEach((x) => x.classList.remove('sel'));
  item.classList.add('sel');
};
for (const type of ['pointerover', 'pointerdown', 'focusin']) document.addEventListener(type, moveCursor);

// 調査用：URL に ?debug を付けたときだけ、画面を直接開ける入口を用意する（普通に遊ぶときは何もしない）
if (new URLSearchParams(location.search).has('debug')) {
  void Promise.all([import('./engine/run'), import('./engine/events'), import('./engine/character')]).then(([run, events, character]) => {
    (window as unknown as { __debug: unknown }).__debug = { app, run, events, character };
  });
}

app.go({ name: 'title' });
