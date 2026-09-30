// Optional integration check: npm install --no-save @electric-sql/pglite
// Uses an isolated in-memory PostgreSQL, never a production database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PLP_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as
    $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202609300001_leaderboard.sql', import.meta.url),'utf8'));
  const player = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users values($1),($2)',[player,other]);
  const identity = async (id,role='authenticated') => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role '+role); };
  const rejected = async (sql,args,pattern) => { await assert.rejects(db.query(sql,args),pattern); checks++; };
  await identity('', 'anon');
  await rejected("select public.plp_start_run(1,'{}','breakthrough','savane-2026-2')",[],/permission denied/);
  assert.equal((await db.query("select * from public.plp_leaderboard('savane-2026-2',null)")).rows.length,0); checks++;
  await identity(player);
  await rejected('select * from public.plp_profiles',[],/permission denied/);
  await rejected("select public.plp_start_run(1,'{\"power\":2.5}','breakthrough','savane-2026-2')",[],/range/);
  await rejected("select public.plp_start_run(100,'{}','breakthrough','savane-2026-2')",[],/level/);
  const {ticket} = (await db.query("select public.plp_start_run(1,'{}','breakthrough','savane-2026-2') as ticket")).rows[0];
  assert.match(ticket.friend_code,/^[A-Z0-9]{10}$/); checks++;
  await rejected("select public.plp_start_run(1,'{}','breakthrough','savane-2026-2')",[],/Wait/);
  await rejected("select public.plp_finish_run($1,'Test',100,90,true)",[ticket.run_id],/duration/);
  await identity(other);
  await rejected("select public.plp_finish_run($1,'Test',100,90,true)",[ticket.run_id],/Start a run|unavailable/);
  await db.exec('reset role');
  await db.query("update public.plp_runs set started_at=clock_timestamp()-interval '100 seconds' where id=$1",[ticket.run_id]);
  await identity(player);
  await rejected("select public.plp_finish_run($1,'<script>',100,90,true)",[ticket.run_id],/name/);
  await rejected("select public.plp_finish_run($1,'Test',1000000,90,true)",[ticket.run_id],/range/);
  const result = (await db.query("select public.plp_finish_run($1,'Élodie',100,90,true) as result",[ticket.run_id])).rows[0].result;
  assert.equal(result.score,2000); checks++;
  await rejected("select public.plp_finish_run($1,'Test',100,90,true)",[ticket.run_id],/already used/);
  await identity('', 'anon');
  assert.equal((await db.query("select * from public.plp_leaderboard('savane-2026-2',null)")).rows[0].score,2000); checks++;
  assert.equal((await db.query("select * from public.plp_leaderboard('savane-2026-2',$1)",[[ticket.friend_code]])).rows.length,1); checks++;
  assert.equal((await db.query("select * from public.plp_leaderboard('savane-2026-2','{}')")).rows.length,0); checks++;
  await rejected("select * from public.plp_leaderboard('savane-2026-2',$1)",[Array(51).fill(ticket.friend_code)],/50/);
  console.log(`${checks} PostgreSQL integration checks passed.`);
} finally { await db.close(); }
