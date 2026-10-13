// Generate Diomede's art with RetroDiffusion. Every job is priced first (free), the batch stops at the budget,
// and finished pictures are never paid for twice (art/ledger.json). The key comes from RETRODIFFUSION_API_KEY.
//   node tools/gen.mjs --budget 3 [--only name,name] [--quote]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const A = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : null).filter(Boolean));
const KEY = process.env.RETRODIFFUSION_API_KEY; if (!KEY) { console.error('set RETRODIFFUSION_API_KEY'); process.exit(3); }
const API = 'https://api.retrodiffusion.ai/v2/inferences', H = { 'X-RD-Token': KEY, 'Content-Type': 'application/json' };
const jobs = JSON.parse(readFileSync(new URL('./jobs.json', import.meta.url)));
mkdirSync('art/raw', { recursive: true });
const ledgerFile = 'art/ledger.json', ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile)) : { spent: 0, done: {} };
const only = A.only ? new Set(String(A.only).split(',')) : null, budget = +(A.budget || 0);
const body = j => ({ prompt: j.prompt, prompt_style: j.style, width: j.w, height: j.h, num_images: 1, seed: j.seed ?? 7, ...(j.remove_bg ? { remove_bg: true } : {}) });
const post = async b => (await fetch(API, { method: 'POST', headers: H, body: JSON.stringify(b) })).json();
const todo = jobs.filter(j => (!only || only.has(j.name)) && !ledger.done[j.name]);
let quote = 0; for (const j of todo) { const r = await post({ ...body(j), check_cost: true }); if (r.error) { console.error(j.name, r.error); process.exit(1); } j.cost = r.balance_cost; quote += r.balance_cost; }
console.log(`${todo.length} pictures, $${quote.toFixed(2)} (already spent $${ledger.spent.toFixed(2)})`);
if (A.quote) process.exit(0);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run(j) {
  if (ledger.spent + j.cost > budget + 1e-9) { console.log(`STOP ${j.name}: over the $${budget} budget`); return; }
  ledger.spent += j.cost; writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));   // reserve before paying
  let r = await post(body(j));
  for (let i = 0; r.task_id && !r.result && i < 90; i++) { await sleep(4000); const t = await (await fetch(`${API}/tasks/${r.task_id}`, { headers: H })).json(); if (t.status === 'succeeded') r = t.result; else if (t.status === 'failed') { r = t; break; } }
  const b64 = r.base64_images?.[0]; if (!b64) { ledger.spent -= j.cost; writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1)); console.log(`FAIL ${j.name} (not charged)`, JSON.stringify(r).slice(0, 200)); return; }
  const buf = Buffer.from(b64, 'base64'), ext = buf.slice(0, 3).toString() === 'GIF' ? 'gif' : 'png';
  writeFileSync(`art/raw/${j.name}.${ext}`, buf); ledger.done[j.name] = { file: `art/raw/${j.name}.${ext}`, cost: j.cost }; writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));
  console.log(`done ${j.name} $${j.cost} -> ${ext}, balance $${r.remaining_balance}`);
}
for (let i = 0; i < todo.length; i += 4) await Promise.all(todo.slice(i, i + 4).map(run));
console.log(`spent $${ledger.spent.toFixed(2)} of $${budget}`);
