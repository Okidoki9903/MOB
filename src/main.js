import { leaderboard } from './leaderboard.js';
import { Game, UPGRADES, upgradeCost, makeLevel, DOCTRINES } from './game.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const screens = { menu: $('menu'), pause: $('pause'), end: $('end'), help: $('help'), leaderboard: $('leaderboard') };
let activeScreen = null;
function show(name) {
  activeScreen = name;
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
  if (name) requestAnimationFrame(() => screens[name].querySelector('button:not(:disabled)')?.focus({ preventScroll: true }));
}

let bannerTimer = 0;
let previousDangerCue = "";
let boardScope = 'world', boardReturn = 'menu', boardRequest = 0;
let lastRun = null, runRegistered = false, startingRun = false, publishingScore = false;
const scoreBlocked = params.has('bot') || params.has('level') || params.has('debug') || (params.has('speed') && Number(params.get('speed')) !== 1);

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
  updateCombat(data) {
    $('missionHud').textContent = data.objectiveText || data.missionTitle || '';
    $('waveStat').textContent = `VAGUE ${Math.max(1, data.wave)} / ${data.waves}`;
    $('killStat').textContent = data.kills;
    $('comboStat').textContent = `Combo ×${data.combo}`;
    const abilityName = data.abilityName || 'Onde des ancêtres';
    const abilityHint = data.abilityHint || 'Repousse la horde';
    const closeEnemies = data.threatCount ?? 0;
    const threat = Math.max(0, Math.min(1, data.threatLevel ?? 0));
    $('enemyStat').textContent = data.enemyCount ?? 0;
    $('threatStat').classList.toggle('hot', threat >= 0.5);
    $('dangerEdge').style.opacity = String(threat * 0.65);
    const dangerCue = closeEnemies >= 8 ? (data.abilityReady ? 'HORDE AU CONTACT · ACTIVE TON POUVOIR' : 'HORDE AU CONTACT · CHANGE DE COULOIR') : '';
    if (dangerCue !== previousDangerCue) {
      $('dangerCue').textContent = dangerCue;
      $('dangerCue').classList.toggle('hidden', !dangerCue);
      previousDangerCue = dangerCue;
    }
    $('abilityFill').style.transform = `scaleX(${Math.max(0, Math.min(1, data.abilityProgress ?? 1))})`;
    $('abilityHint').textContent = data.abilityActive ? abilityHint : data.abilityReady ? `${matchMedia('(pointer: coarse)').matches ? 'TOUCHE ICI' : 'ESPACE'} · ${abilityHint}` : 'Bientôt disponible';
    $('abilityBtn').classList.toggle('urgent', data.abilityReady && closeEnemies >= 8);
    $('abilityBtn').disabled = !data.abilityReady;
    $('abilityBtn').classList.toggle('ready', data.abilityReady);
    $('abilityLabel').textContent = data.abilityActive ? `${abilityName} · actif` : data.abilityReady ? abilityName : `Recharge · ${Math.ceil(data.abilityCooldown)} s`;
    $('abilityBtn').title = `${abilityName} · Espace : ${abilityHint}`;
    $('abilityBtn').setAttribute('aria-label', `Activer ${abilityName}. ${abilityHint}`);
  },
  onState(state, data = {}) {
    const playing = state === 'playing';
    document.body.dataset.state = state;
    $('controlHint').classList.toggle('hidden', !playing);
    if (state === 'win' || state === 'lose') {
      lastRun = { ...data, won: state === 'win', eligible: runRegistered && !scoreBlocked };
      runRegistered = false;
      $('resultStats').innerHTML = `<div><b>${data.kills ?? 0}</b>ENNEMIS</div><div><b>×${data.bestCombo ?? 0}</b>MEILLEUR COMBO</div><div><b>${Math.round(data.duration ?? 0)}s</b>DURÉE</div>`;
    }
    $('hud').classList.toggle('hidden', !(playing || state === 'paused'));
    $('labels').classList.toggle('hidden', !(playing || state === 'paused'));
    $('bubble').classList.toggle('hidden', !playing);
    if (!playing) { ui.tutorial(false); $('dangerEdge').style.opacity = '0'; }
    if (state === 'menu') { refreshMenu(); show('menu'); }
    else if (state === 'paused') show('pause');
    else if (state === 'win') {
      $('endTitle').textContent = 'Victoire !';
      $('endSub').textContent = `${data.missionTitle || 'Expédition'} · Niveau ${data.level} terminé · ${data.army} enfants debout`;
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
if (params.has('level')) { game.save.level = Math.min(99, Math.max(1, Number(params.get('level')) | 0)); game.prepareLevel(game.save.level); }

const ICONS = { recruits: '♟', power: '⌁', rate: 'ϟ' };
function refreshMenu() {
  refreshDoctrines();
  $('menuLevel').textContent = 'Niveau ' + game.save.level;
  const mission = makeLevel(game.save.level).mission;
  $('missionTitle').textContent = mission?.title || 'Percée';
  $('missionBrief').textContent = mission?.brief || 'Traverse la horde et terrasse son chef.';
  $('missionObjective').textContent = mission?.objective || 'Vaincre le boss';
  $('shopCoins').textContent = game.save.coins;
  $('muteBtn').textContent = game.sound.muted ? '♪̸' : '♫';
  $('muteBtn').setAttribute('aria-label', game.sound.muted ? 'Activer le son' : 'Couper le son');
  $('muteBtn').setAttribute('aria-pressed', String(!game.sound.muted));
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
    b.disabled = maxed || game.save.coins < cost;
    b.setAttribute('aria-label', `${u.label}, niveau ${lvl}. ${u.desc}. ${maxed ? 'Maximum atteint' : cost + ' pièces'}`);
    b.addEventListener('click', () => {
      game.sound.unlock();
      if (game.buyUpgrade(key)) refreshMenu();
      else { game.sound.click(); b.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 200 }); }
    });
    grid.appendChild(b);
  }
}

function refreshDoctrines(focusId) {
  const unlocked = game.save.level >= 2;
  const selected = game.save.doctrine || 'balanced';
  $('doctrineUnlock').textContent = unlocked ? 'Choix gratuit · permanent' : 'Débloqué au niveau 2';
  const choices = $('doctrineChoices');
  choices.replaceChildren();
  for (const doctrine of DOCTRINES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'doctrine-card';
    button.dataset.doctrine = doctrine.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(selected === doctrine.id));
    button.setAttribute('aria-label', `${doctrine.label}. ${doctrine.description}${!unlocked ? '. Débloqué au niveau 2' : ''}`);
    button.disabled = !unlocked;
    button.tabIndex = selected === doctrine.id ? 0 : -1;
    const name = document.createElement('strong'); name.textContent = doctrine.label;
    const description = document.createElement('span'); description.textContent = doctrine.description;
    button.append(name, description);
    button.addEventListener('click', () => {
      if (game.setDoctrine(doctrine.id)) { game.sound.click(); refreshDoctrines(doctrine.id); }
    });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const current = DOCTRINES.findIndex(value => value.id === doctrine.id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? DOCTRINES.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + DOCTRINES.length) % DOCTRINES.length;
      if (game.setDoctrine(DOCTRINES[next].id)) refreshDoctrines(DOCTRINES[next].id);
    });
    choices.append(button);
    if (focusId === doctrine.id) button.focus({ preventScroll: true });
  }
}

$('abilityBtn').addEventListener('click', () => game.activateAbility());
$('playBtn').addEventListener('click', () => launchRun(false));
$('pauseBtn').addEventListener('click', () => game.pause());
$('resumeBtn').addEventListener('click', () => game.resume());
$('quitBtn').addEventListener('click', () => { game.prepareLevel(game.save.level); game.state = 'menu'; game.sound.stopMusic(); ui.onState('menu'); });
$('endBtn').addEventListener('click', () => launchRun(true));
$('endMenu').addEventListener('click', () => game.nextLevel());
$('muteBtn').addEventListener('click', () => { game.sound.unlock(); game.sound.setMuted(!game.sound.muted); refreshMenu(); });
$('helpBtn').addEventListener('click', () => show('help'));
$('helpClose').addEventListener('click', () => show('menu'));


function boardConfiguration() {
  if (scoreBlocked) return { configured: false, reason: 'Les parties de test (bot, niveau imposé ou vitesse modifiée) ne participent pas aux classements.' };
  return leaderboard.getStatus();
}
function refreshScoreForm() {
  const status = boardConfiguration();
  $('publishScore').disabled = publishingScore || !status.configured || !lastRun?.eligible || !$('scoreConsent').checked || !/^[\p{L}\p{N} _-]{3,20}$/u.test($('playerName').value.trim());
  $('scoreSummary').textContent = !status.configured ? status.reason : lastRun?.eligible ? `Niveau ${lastRun.level} · ${lastRun.kills ?? 0} éliminations · ${lastRun.won ? 'Victoire' : 'Défaite'}. Score calculé par le serveur.` : 'Active le partage avant de lancer ta prochaine expédition pour pouvoir publier son résultat.';
  $('ownFriendCode').textContent = leaderboard.getFriendCode() || 'disponible après activation du partage';
}
async function loadBoard() {
  const request = ++boardRequest;
  $('boardEntries').replaceChildren();
  $('boardStatus').textContent = 'Chargement des scores…';
  $('boardPanel').setAttribute('aria-busy', 'true');
  refreshScoreForm();
  const status = boardConfiguration();
  $('joinFriends').disabled = !status.configured;
  if (!status.configured) {
    $('boardStatus').textContent = status.reason || 'Le classement en ligne n’est pas encore connecté.';
    $('boardPanel').setAttribute('aria-busy', 'false');
    return;
  }
  try {
    const result = await leaderboard.list(boardScope);
    if (request !== boardRequest) return;
    $('boardStatus').textContent = result.entries.length ? 'Meilleures expéditions' : boardScope === 'friends' ? 'Aucun résultat pour tes amis. Ajoute leur code ou invite-les à publier une expédition.' : 'Aucun score publié. La première légende sera peut-être la tienne.';
    result.entries.forEach((entry, index) => {
      const row = document.createElement('li');
      const rank = document.createElement('span'); rank.className = 'board-rank'; rank.textContent = String(boardScope === 'world' && Number.isFinite(Number(entry.rank)) ? Number(entry.rank) : index + 1).padStart(2, '0');
      const player = document.createElement('span'); player.className = 'board-player'; player.textContent = entry.name;
      const detail = document.createElement('small'); detail.textContent = `Niveau ${entry.level}`; player.append(detail);
      const points = document.createElement('strong'); points.textContent = Number(entry.score).toLocaleString('fr-CA');
      row.append(rank, player, points); $('boardEntries').append(row);
    });
  } catch (error) {
    if (request !== boardRequest) return;
    $('boardStatus').textContent = 'Classement indisponible. Vérifie ta connexion puis réessaie.';
  } finally {
    if (request === boardRequest) $('boardPanel').setAttribute('aria-busy', 'false');
  }
}
function selectBoard(scope) {
  boardScope = scope;
  for (const [id, value] of [['worldTab', 'world'], ['friendsTab', 'friends']]) {
    $(id).setAttribute('aria-selected', String(scope === value)); $(id).tabIndex = scope === value ? 0 : -1;
  }
  $('boardPanel').setAttribute('aria-labelledby', scope === 'world' ? 'worldTab' : 'friendsTab');
  $('friendSettings').classList.toggle('hidden', scope !== 'friends');
  loadBoard();
}
function openBoard(from) { boardReturn = from; show('leaderboard'); loadBoard(); }
async function launchRun(restart) {
  if (startingRun) return;
  startingRun = true;
  const button = restart ? $('endBtn') : $('playBtn');
  button.disabled = true;
  runRegistered = false;
  try {
    if (boardConfiguration().configured && $('scoreConsent').checked) {
      await leaderboard.startRun({ level: game.save.level, upgrades: game.save.up, mission: makeLevel(game.save.level).mission?.id });
      runRegistered = true;
    }
  } catch { $('submitStatus').textContent = 'La connexion au classement a échoué. Cette expédition restera hors classement.'; }
  finally { button.disabled = false; startingRun = false; }
  show(null);
  if (restart) game.restart(); else game.start();
}
$('leaderboardBtn').addEventListener('click', () => openBoard('menu'));
$('endLeaderboard').addEventListener('click', () => openBoard('end'));
$('closeBoard').addEventListener('click', () => { ++boardRequest; show(boardReturn); });
$('refreshBoard').addEventListener('click', loadBoard);
$('worldTab').addEventListener('click', () => selectBoard('world'));
$('friendsTab').addEventListener('click', () => selectBoard('friends'));
for (const id of ['worldTab', 'friendsTab']) $(id).addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const scope = event.key === 'Home' ? 'world' : event.key === 'End' ? 'friends' : boardScope === 'world' ? 'friends' : 'world';
  selectBoard(scope); $(scope === 'world' ? 'worldTab' : 'friendsTab').focus();
});
$('scoreConsent').addEventListener('change', refreshScoreForm);
$('playerName').addEventListener('input', refreshScoreForm);
$('joinFriends').addEventListener('click', async () => {
  const code = $('friendCode').value.trim();
  if (!code) { $('boardStatus').textContent = 'Saisis le code de ton ami.'; return; }
  $('joinFriends').disabled = true;
  try { await leaderboard.addFriend(code); $('friendCode').value = ''; await loadBoard(); }
  catch { $('boardStatus').textContent = 'Impossible d’ajouter ce code. Vérifie le code et ta connexion.'; }
  finally { $('joinFriends').disabled = !boardConfiguration().configured; }
});
$('scoreForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if ($('publishScore').disabled || !lastRun?.eligible) return;
  publishingScore = true;
  $('publishScore').disabled = true;
  $('submitStatus').textContent = 'Publication en cours…';
  try {
    await leaderboard.submit({ name: $('playerName').value.trim(), level: lastRun.level, kills: lastRun.kills ?? 0, duration: lastRun.duration ?? 0, won: lastRun.won });
    lastRun.eligible = false;
    $('submitStatus').textContent = 'Résultat publié. Ton code permet à tes amis de te retrouver.';
    await loadBoard();
  } catch (error) { $('submitStatus').textContent = error.message || 'Publication impossible. Tu peux réessayer sans quitter cet écran.'; }
  finally { publishingScore = false; refreshScoreForm(); }
});

ui.onState('menu');
if (params.has('autostart')) { show(null); game.start(); }

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Keep keyboard navigation inside the active overlay.
window.addEventListener('keydown', (event) => {
  if (!activeScreen) return;
  if (event.key === 'Escape' && activeScreen === 'leaderboard') { ++boardRequest; show(boardReturn); return; }
  if (event.key === 'Escape' && activeScreen === 'help') { show('menu'); return; }
  if (event.key !== 'Tab') return;
  const controls = [...screens[activeScreen].querySelectorAll('button:not(:disabled), a[href], input:not(:disabled)')].filter(el => el.offsetParent !== null && el.tabIndex !== -1);

  if (!controls.length) return;
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
