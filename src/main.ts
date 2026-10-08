import './style.css';
import { createApp } from './ui/app';
import { battleScreen } from './ui/screens/battle';
import { mapScreen } from './ui/screens/map';
import { endScreen, eventScreen, lootScreen, recruitScreen, restScreen, rewardScreen, shopScreen } from './ui/screens/misc';
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
  end: endScreen,
});

app.go({ name: 'title' });
