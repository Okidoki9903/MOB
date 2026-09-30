import { leaderboardConfig } from './leaderboard-config.js';

const SESSION_KEY = 'plp-ranking-session';
const FRIENDS_KEY = 'plp-friend-codes';
export function createLeaderboard({ config = leaderboardConfig, storage = globalThis.localStorage, fetcher = globalThis.fetch, clock = Date.now } = {}) {
  let session = null, pending = null, signing = null, code = null, runAttempt = 0;
  const read = key => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
  const write = (key, value) => { try { storage.setItem(key, JSON.stringify(value)); } catch {} };
  const friends = () => { const values = read(FRIENDS_KEY); return (Array.isArray(values) ? values : []).filter(v => typeof v === 'string' && /^[A-Z0-9]{10}$/.test(v)).slice(0, 50); };
  session = read(SESSION_KEY);
  code = session?.friendCode || null;
  function getStatus() {
    let publicKey = typeof config.publishableKey === 'string' && config.publishableKey.startsWith('sb_publishable_');
    if (!publicKey) try { publicKey = JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch {}
    const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url) && publicKey;
    return { configured, reason: configured ? '' : 'Le classement partagé attend la configuration Supabase.' };
  }
  async function request(path, body, token) {
    if (!getStatus().configured) throw Error(getStatus().reason);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher(config.url.replace(/\/$/, '') + path, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', apikey: config.publishableKey, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.message || data.msg || data.error_description || 'Le classement est temporairement indisponible.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('Le classement met trop de temps à répondre. Réessaie.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function authenticate() {
    if (session?.access_token && session.expires_at > clock() / 1000 + 30) return session.access_token;
    if (!signing) signing = (async () => {
      const data = session?.refresh_token
        ? await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token })
        : await request('/auth/v1/signup', { data: {} });
      if (!data.access_token || !data.refresh_token) throw Error('La connexion anonyme Supabase doit être activée.');
      session = { ...data, friendCode: code, expires_at: data.expires_at || clock() / 1000 + data.expires_in };
      write(SESSION_KEY, session);
      return data.access_token;
    })().finally(() => { signing = null; });
    return signing;
  }
  async function rpc(name, body, authenticated = false) {
    return request('/rest/v1/rpc/' + name, body, authenticated ? await authenticate() : undefined);
  }
  return {
    getStatus,
    getFriendCode: () => code,
    getFriends: friends,
    async addFriend(value) {
      const friend = String(value).trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(friend)) throw Error('Un code ami contient 10 lettres ou chiffres.');
      const list = friends();
      if (!list.includes(friend)) { if (list.length >= 50) throw Error('Tu peux suivre jusqu’à 50 amis.'); list.push(friend); write(FRIENDS_KEY, list); }
      return list;
    },
    async list(scope = 'world') {
      const friendScope = scope === 'friends' || scope === 'amis';
      if (friendScope && !friends().length && !code) return { entries: [] };
      const entries = await rpc('plp_leaderboard', { p_season: config.season, p_codes: friendScope ? [...new Set([...(code ? [code] : []), ...friends()])].slice(0, 50) : null });
      return { entries: entries.map(e => ({ name: e.name, score: e.score, level: e.level, rank: e.rank })), viewerId: session?.user?.id };
    },
    async startRun({ level, upgrades = {}, mission = 'campaign' }) {
      pending = null;
      const attempt = ++runAttempt;
      const run = await rpc('plp_start_run', { p_level: level, p_upgrades: upgrades, p_mission: typeof mission === 'string' ? mission : mission.id, p_season: config.season }, true);
      if (attempt !== runAttempt) throw Error('Une nouvelle expédition a remplacé cette tentative.');
      pending = { id: run.run_id, level };
      code = run.friend_code;
      session.friendCode = code; write(SESSION_KEY, session);
      return run;
    },
    async submit({ name, level, kills, duration, won }) {
      if (!pending || pending.level !== level) throw Error('Active le partage avant de lancer une nouvelle expédition.');
      const displayName = String(name).trim();
      if (!/^[\p{L}\p{N} _-]{3,20}$/u.test(displayName)) throw Error('Choisis un pseudo de 3 à 20 lettres, chiffres, espaces ou tirets.');
      const result = await rpc('plp_finish_run', { p_run: pending.id, p_name: displayName, p_kills: kills, p_duration: duration, p_won: !!won }, true);
      pending = null;
      return { ...result, code };
    },
  };
}
export const leaderboard = createLeaderboard();
