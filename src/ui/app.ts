// 画面の切り替えを担当する。

import type { RunState } from '../engine/run';
import { saveRun } from '../engine/run';
import type { EventPick } from '../engine/events';
import type { Rewards, InvEntry } from '../engine/run';
import type { BattleKind } from '../engine/battle';

export type Screen =
  | { name: 'title' }
  | { name: 'jobs' }
  | { name: 'starter'; job: string }
  | { name: 'map' }
  | { name: 'battle'; enemies: string[]; kind: BattleKind; boss: boolean }
  | { name: 'reward'; title: string; rewards: Rewards; boss: boolean }
  | { name: 'loot'; title: string; text: string; drops: InvEntry[] }
  | { name: 'shop' }
  | { name: 'rest' }
  | { name: 'event'; pick: EventPick }
  | { name: 'recruit' }
  | { name: 'blessing' }
  | { name: 'end' };

export interface App {
  run: RunState | null;
  root: HTMLElement;
  go(screen: Screen): void;
  save(): void;
}

type Renderer = (app: App, screen: never) => HTMLElement | Promise<HTMLElement>;

export function createApp(root: HTMLElement, screens: Record<Screen['name'], Renderer>): App {
  const app: App = {
    run: null,
    root,
    go(screen) {
      const render = screens[screen.name] as (app: App, s: Screen) => HTMLElement | Promise<HTMLElement>;
      Promise.resolve(render(app, screen)).then((el) => {
        root.replaceChildren(el);
        window.scrollTo(0, 0);
      });
    },
    save() {
      if (app.run) saveRun(app.run);
    },
  };
  return app;
}

/** 中断したところから再開するときの画面 */
export function resumeScreen(run: RunState): Screen {
  if (run.recruits) return { name: 'recruit' };
  if (run.blessingChoices) return { name: 'blessing' };
  return { name: 'map' };
}
