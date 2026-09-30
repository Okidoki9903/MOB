import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeaderboard } from '../src/leaderboard.js';
const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test', season: 'test' };
const storage = () => { const values = new Map(); return { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) }; };
test('unconfigured and secret-key integrations never send requests', async () => {
  for (const publishableKey of ['', 'sb_secret_do-not-use', 'x.' + btoa(JSON.stringify({role:'service_role'})) + '.x']) {
    let calls = 0;
    const board = createLeaderboard({ config: {...config,publishableKey}, storage: storage(), fetcher: () => { calls++; } });
    assert.equal(board.getStatus().configured, false);
    await assert.rejects(board.list(), /configuration/);
    assert.equal(calls, 0);
  }
});
test('reads are public; opt-in runs authenticate, bind result, ignore client score and prevent replay', async () => {
  const calls = [];
  const board = createLeaderboard({ config, storage: storage(), fetcher: async (url, request) => {
    calls.push({url,...request,body:JSON.parse(request.body)});
    const data = url.includes('/signup') ? {access_token:'user-token',refresh_token:'refresh',expires_in:3600,user:{id:'player'}}
      : url.includes('plp_start_run') ? {run_id:'run-1',friend_code:'ABC1234567'}
      : url.includes('plp_finish_run') ? {score:1234}
      : [{name:'Ami',score:120,level:2,rank:1}];
    return {ok:true,json:async()=>data};
  } });
  assert.equal((await board.list()).entries[0].name, 'Ami');
  assert.equal(calls[0].headers.Authorization, undefined);
  await assert.rejects(board.submit({name:'Test',level:1}), /Active le partage/);
  await board.startRun({level:1});
  assert.equal(board.getFriendCode(), 'ABC1234567');
  const result = await board.submit({name:'Test',score:999999999,level:1,kills:100,duration:30,won:false});
  assert.equal(result.score,1234);
  const submission = calls.find(c=>c.url.includes('finish_run'));
  assert.equal(submission.headers.Authorization,'Bearer user-token');
  assert.equal(submission.body.p_score,undefined);
  assert.equal(submission.body.p_run,'run-1');
  await assert.rejects(board.submit({name:'Test',level:1}), /Active le partage/);
  await board.addFriend(' abc1234567 ');
  await board.list('friends');
  assert.deepEqual(calls.at(-1).body.p_codes,['ABC1234567']);
  await assert.rejects(board.addFriend('<script>'), /code ami/);
});
test('damaged local friend data is ignored and backend failures stay visible', async () => {
  const saved = storage(); saved.setItem('plp-friend-codes','{}');
  const board = createLeaderboard({config,storage:saved,fetcher:async()=>({ok:false,json:async()=>({message:'Service indisponible'})})});
  assert.deepEqual(board.getFriends(),[]);
  await assert.rejects(board.list(), /Service indisponible/);
});
