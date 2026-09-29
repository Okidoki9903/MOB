import { Game, UPGRADES, upgradeCost } from './game.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const screens = { menu: $('menu'), pause: $('pause'), end: $('end'), help: $('help') };
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
}

let bannerTimer = 0;
const ui = {
  labels: $('labels'),
  floats: $('floats'),
  bubble: $('bubble'),
  count: $('bubble'),
  coins: $('coins'),
  level: $('level'),
  progress: $('progress'),
  bossBar: $('bossBar'),
  bossFill: $('bossFill'),
  bossName: $('bossName'),
  banner(title, sub) {
    const b = $('banner');
    b.querySelector('.b-title').textContent = title;
    b.querySelector('.b-sub').textContent = sub || '';
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), 1600);
  },
  tutorial(on) { $('tutorial').classList.toggle('hidden', !on); },
  onState(state, data = {}) {
    const playing = state === 'playing';
    $('hud').classList.toggle('hidden', !(playing || state === 'paused'));
    $('labels').classList.toggle('hidden', !(playing || state === 'paused'));
    $('bubble').classList.toggle('hidden', !playing);
    if (!playing) ui.tutorial(false);
    if (state === 'menu') { refreshMenu(); show('menu'); }
    else if (state === 'paused') show('pause');
    else if (state === 'win') {
      $('endTitle').textContent = 'Victoire !';
      $('endSub').textContent = `Niveau ${data.level} terminé · ${data.army} enfants debout`;
      $('endCoins').textContent = data.earned;
      $('endBtn').textContent = 'Niveau suivant';
      show('end');
    } else if (state === 'lose') {
      $('endTitle').textContent = 'Défaite…';
      $('endSub').textContent = 'Améliore ta troupe et retente ta chance !';
      $('endCoins').textContent = data.earned;
      $('endBtn').textContent = 'Réessayer';
      show('end');
    } else show(null);
  },
};

const game = new Game($('game'), ui, {
  bot: params.has('bot'),
  speed: Number(params.get('speed')) || 1,
});
window.game = game;
if (params.has('level')) { game.save.level = Math.max(1, Number(params.get('level')) | 0); game.prepareLevel(game.save.level); }

const ICONS = { recruits: '👦🏿', power: '💪🏿', rate: '⚡' };
function refreshMenu() {
  $('menuLevel').textContent = 'Niveau ' + game.save.level;
  $('shopCoins').textContent = game.save.coins;
  $('muteBtn').textContent = game.sound.muted ? '🔇' : '🔊';
  const grid = $('shopGrid');
  grid.innerHTML = '';
  for (const key of Object.keys(UPGRADES)) {
    const u = UPGRADES[key];
    const lvl = game.save.up[key];
    const maxed = lvl >= u.max;
    const cost = upgradeCost(key, lvl);
    const b = document.createElement('button');
    b.className = 'up-card' + (maxed ? ' maxed' : game.save.coins < cost ? ' poor' : '');
    b.innerHTML = `<span class="u-ico">${ICONS[key]}</span><span class="u-name">${u.label}</span>` +
      `<span class="u-lvl">niv. ${lvl}</span><span class="u-desc">${u.desc}</span>` +
      `<span class="u-cost">${maxed ? 'MAX' : '<span class="coin-ico"></span>' + cost}</span>`;
    b.addEventListener('click', () => {
      game.sound.unlock();
      if (game.buyUpgrade(key)) refreshMenu();
      else { game.sound.click(); b.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 200 }); }
    });
    grid.appendChild(b);
  }
}

$('playBtn').addEventListener('click', () => { show(null); game.start(); });
$('pauseBtn').addEventListener('click', () => game.pause());
$('resumeBtn').addEventListener('click', () => game.resume());
$('quitBtn').addEventListener('click', () => { game.prepareLevel(game.save.level); game.state = 'menu'; game.sound.stopMusic(); ui.onState('menu'); });
$('endBtn').addEventListener('click', () => { game.restart(); });
$('endMenu').addEventListener('click', () => game.nextLevel());
$('muteBtn').addEventListener('click', () => { game.sound.unlock(); game.sound.setMuted(!game.sound.muted); refreshMenu(); });
$('helpBtn').addEventListener('click', () => show('help'));
$('helpClose').addEventListener('click', () => show('menu'));

ui.onState('menu');
if (params.has('autostart')) { show(null); game.start(); }

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
