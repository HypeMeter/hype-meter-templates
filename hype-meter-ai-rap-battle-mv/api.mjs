#!/usr/bin/env node
// OPTIONAL: make the paid parts with your own API keys instead of on the websites. Nothing is sent unless you add --yes;
// without it, each command only lists what it would make and what it would cost.
//   node api.mjs song <project>    ElevenLabs Music: song-plan.json → song.mp3            (ELEVENLABS_API_KEY; uses your plan's credits)
//   node api.mjs words <project>   ElevenLabs speech-to-text: song.mp3 → words.json      (ELEVENLABS_API_KEY)
//   node api.mjs cast <project>    character sheets from each character's "look"         (COMETAPI_KEY)
//   node api.mjs frames <project>  first picture of every shot, using the sheets          (COMETAPI_KEY)
//   node api.mjs clips <project>   lip-sync (Kling Avatar) and motion (Wan 3.0, 480p)     (COMETAPI_KEY)
// Options: --yes (really send), --only s02,s03 (just these shots). Files that already exist are skipped, so a rerun only makes what's missing.
// Keys are read from the environment and only ever go into request headers.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProject, songPlan, audioWindow, motionSeconds, frameFile, clipFile, PRICES } from './battle.mjs';

export const ELEVEN = 'https://api.elevenlabs.io';
export const COMET = 'https://api.cometapi.com';
export const MODELS = { music: 'music_v2_5', stt: 'scribe_v2', image: 'gemini-nano-banana-2.1', motion: 'wan3.0', motionSize: '480x832' };
export const AVATAR_ROUTE = '/kling/v1/videos/avatar/image2video';

const snake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
export const snakeKeys = v => Array.isArray(v) ? v.map(snakeKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [snake(k), snakeKeys(x)])) : v;

export function key(name, env = process.env) {
  const k = env[name];
  if (!k) throw new Error(`${name} is not set. In the terminal: export ${name}=your-key (keys stay on your computer and only go to that company's API)`);
  return k;
}

// Image bytes → real extension (image models often return JPEG even when you ask for .png).
export function imageExt(buf) {
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const imagePart = file => ({ inlineData: { mimeType: MIME[path.extname(file).toLowerCase()], data: fs.readFileSync(file).toString('base64') } });

// ---------- request builders (pure, tested) ----------
export const musicRequest = (plan, apiKey) => ({
  url: `${ELEVEN}/v1/music?output_format=mp3_44100_192`, method: 'POST',
  headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
  body: JSON.stringify({ composition_plan: snakeKeys(plan), model_id: MODELS.music }),
});
export const imageRequest = ({ prompt, refs = [], apiKey }) => ({
  url: `${COMET}/v1beta/models/${MODELS.image}:generateContent`, method: 'POST',
  headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
  body: JSON.stringify({ contents: [{ role: 'user', parts: [...refs.map(imagePart), { text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '9:16' } } }),
});
export const avatarRequest = ({ image, audio, prompt, apiKey }) => ({
  url: COMET + AVATAR_ROUTE, method: 'POST',
  headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify({ image: fs.readFileSync(image).toString('base64'), sound_file: fs.readFileSync(audio).toString('base64'), prompt, mode: 'std' }),
});
export function motionRequest({ image, prompt, seconds, apiKey }) {
  const form = new FormData();
  form.append('model', MODELS.motion); form.append('prompt', prompt); form.append('seconds', String(seconds)); form.append('size', MODELS.motionSize);
  const ext = path.extname(image).toLowerCase();
  form.append('first_frame', new Blob([fs.readFileSync(image)], { type: MIME[ext] }), path.basename(image));
  return { url: `${COMET}/v1/videos`, method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form };
}

// ---------- calls ----------
async function send(req, fetchFn, as = 'json') {
  const res = await fetchFn(req.url, { method: req.method, headers: req.headers, body: req.body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${new URL(req.url).host} answered ${res.status}: ${text.slice(0, 300)}`);
  }
  return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function poll(check, { every = 10000, timeout = 1200000, wait = sleep } = {}) {
  for (let waited = 0; ; waited += every) {
    const r = await check();
    if (r) return r;
    if (waited >= timeout) throw new Error(`still not finished after ${Math.round(timeout / 60000)} minutes; run the command again later (finished files are kept)`);
    await wait(every);
  }
}

export async function makeImage({ prompt, refs, out, apiKey, fetchFn = fetch }) {
  const data = await send(imageRequest({ prompt, refs, apiKey }), fetchFn);
  if (data.promptFeedback?.blockReason) throw new Error(`picture refused: ${data.promptFeedback.blockReason} (change the prompt)`);
  const part = (data.candidates?.[0]?.content?.parts ?? []).find(p => p.inlineData?.data);
  if (!part) throw new Error('no picture came back' + (data.candidates?.[0]?.finishReason ? ` (${data.candidates[0].finishReason})` : ''));
  const buf = Buffer.from(part.inlineData.data, 'base64');
  const file = out.replace(/\.(png|jpe?g|webp)$/i, '') + (imageExt(buf) ?? '.png');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf);
  return file;
}

export async function makeLipsync({ image, audio, prompt, out, apiKey, fetchFn = fetch, wait }) {
  const created = await send(avatarRequest({ image, audio, prompt, apiKey }), fetchFn);
  if (created.code && created.code !== 0) throw new Error(`lip-sync refused: ${created.message}`);
  const id = created.data?.task_id;
  if (!id) throw new Error('lip-sync: no task id came back');
  const auth = { authorization: `Bearer ${apiKey}` };
  const done = await poll(async () => {
    const t = (await send({ url: `${COMET}${AVATAR_ROUTE}/${id}`, method: 'GET', headers: auth }, fetchFn)).data ?? {};
    if (['failed', 'error'].includes(t.task_status)) throw new Error(`lip-sync failed: ${t.task_status_msg ?? 'no reason given'}`);
    return t.task_status === 'succeed' ? t : null;
  }, { wait });
  const url = done.task_result?.videos?.[0]?.url;
  const buf = await send({ url, method: 'GET', headers: {} }, fetchFn, 'buffer');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf);
  return out;
}

export async function makeMotion({ image, prompt, seconds, out, apiKey, fetchFn = fetch, wait }) {
  const created = await send(motionRequest({ image, prompt, seconds, apiKey }), fetchFn);
  const id = created.id ?? created.task_id;
  if (!id) throw new Error('video: no task id came back');
  const auth = { authorization: `Bearer ${apiKey}` };
  await poll(async () => {
    const t = await send({ url: `${COMET}/v1/videos/${id}`, method: 'GET', headers: auth }, fetchFn);
    const st = String(t.status).toLowerCase();
    if (['failed', 'error', 'cancelled'].includes(st)) throw new Error(`video failed: ${t.error?.message ?? st}`);
    return ['completed', 'succeeded', 'success'].includes(st) ? t : null;
  }, { wait });
  const buf = await send({ url: `${COMET}/v1/videos/${id}/content`, method: 'GET', headers: auth }, fetchFn, 'buffer');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf);
  return out;
}

// ---------- what each command would make ----------
// Sheets to upload with a frame prompt: refs, or the singer of a lip-sync shot.
const refFiles = (p, s) => (s.refs ?? (s.who && s.who !== 'Both' && p.cfg.characters[s.who] ? [s.who] : [])).map(r => path.join(p.dir, p.cfg.characters[r].sheet ?? `cast/${r.toLowerCase()}.png`));
export function jobs(p, cmd, only) {
  const pick = s => !only || only.includes(s.id);
  const style = p.cfg.frameStyle ? ' ' + p.cfg.frameStyle : '';
  if (cmd === 'cast') return Object.entries(p.cfg.characters).filter(([, c]) => c.look)
    .map(([name, c]) => ({ what: `sheet ${name}`, out: path.join(p.dir, c.sheet ?? `cast/${name.toLowerCase()}.png`), usd: PRICES.image, kind: 'image', prompt: c.look, refs: [] }))
    .filter(j => !fs.existsSync(j.out));
  if (cmd === 'frames') return p.shots.filter(s => pick(s) && s.frame && !s.image && !frameFile(p, s))
    .map(s => ({ what: `frame ${s.id}`, out: path.join(p.dir, 'frames', s.id + '.png'), usd: PRICES.image, kind: 'image', prompt: s.frame + style, refs: refFiles(p, s) }));
  if (cmd === 'clips') return p.shots.filter(s => pick(s) && s.type !== 'still' && !clipFile(p, s)).map(s => {
    const out = path.join(p.dir, 'clips', s.id + '.mp4'), image = frameFile(p, s) ?? null; // null = picture not made yet
    if (s.type === 'lipsync') {
      const [a0, a1] = audioWindow(s);
      return { what: `lip-sync ${s.id}`, out, image, audio: path.join(p.dir, 'audio', s.id + '.mp3'), usd: +(Math.ceil(a1 - a0) * PRICES.lipsyncPerSecond).toFixed(3), kind: 'lipsync',
        prompt: s.prompt ?? p.cfg.characters[s.who]?.performs ?? 'Raps to the camera with attitude, head moving to the beat, blinking naturally.' };
    }
    return { what: `motion ${s.id}`, out, image, seconds: motionSeconds(s), usd: +(motionSeconds(s) * PRICES.motionPerSecond).toFixed(3), kind: 'motion', prompt: `${s.motion} Smooth natural motion, no text.` };
  });
  return [];
}

async function main(argv, { env = process.env, fetchFn = fetch, log = console.log } = {}) {
  const [cmd, dir] = argv;
  const yes = argv.includes('--yes'), oi = argv.indexOf('--only'), only = oi >= 0 ? (argv[oi + 1] ?? '').split(',').filter(Boolean) : null;
  if (only && !only.length) { log('--only needs shot ids, for example --only s02,s03'); return 2; }
  if (!['song', 'words', 'cast', 'frames', 'clips'].includes(cmd) || !dir) { log('usage: node api.mjs <song|words|cast|frames|clips> <project> [--only s02,s03] [--yes]'); return 2; }
  const p = loadProject(dir);
  const song = path.join(dir, p.cfg.song || 'song.mp3');
  if (cmd === 'song') {
    const plan = songPlan(p.cfg, p.sections), secs = plan.chunks.reduce((s, c) => s + c.durationMs, 0) / 1000;
    if (fs.existsSync(song)) { log(`${path.basename(song)} already exists; delete it to make a new one`); return 0; }
    log(`would make ${path.basename(song)}: ${plan.chunks.length} sections, about ${Math.round(secs)} s, with ElevenLabs Music (uses your plan's credits)`);
    if (!yes) { log('nothing sent. Add --yes to make it.'); return 0; }
    const buf = await send(musicRequest(plan, key('ELEVENLABS_API_KEY', env)), fetchFn, 'buffer');
    fs.writeFileSync(song, buf); log(`wrote ${song}. Listen to it before you go on: a new song costs credits again.`);
    return 0;
  }
  if (cmd === 'words') {
    const out = path.join(dir, 'words.json');
    if (!fs.existsSync(song)) { log(`no ${path.basename(song)} yet`); return 1; }
    log(`would transcribe ${path.basename(song)} with ElevenLabs speech-to-text → words.json`);
    if (!yes) { log('nothing sent. Add --yes to make it.'); return 0; }
    const form = new FormData();
    form.append('model_id', MODELS.stt); form.append('timestamps_granularity', 'word');
    form.append('file', new Blob([fs.readFileSync(song)], { type: 'audio/mpeg' }), path.basename(song));
    const data = await send({ url: `${ELEVEN}/v1/speech-to-text`, method: 'POST', headers: { 'xi-api-key': key('ELEVENLABS_API_KEY', env) }, body: form }, fetchFn);
    fs.writeFileSync(out, JSON.stringify(data, null, 1)); log(`wrote ${out}. Next: node battle.mjs lines ${dir}`);
    return 0;
  }
  const list = jobs(p, cmd, only);
  const missing = list.flatMap(j => [j.image, j.audio, ...(j.refs ?? [])].filter(f => f !== undefined && (!f || !fs.existsSync(f))).map(f => `${j.what}: missing ${f ? path.relative(dir, f) : 'its first picture (frames/<id>.png)'}`));
  const usd = list.reduce((s, j) => s + j.usd, 0);
  for (const j of list) log(`${j.what.padEnd(16)} about USD ${j.usd.toFixed(2)}`);
  log(`${list.length} to make, about USD ${usd.toFixed(2)} in total (list prices; redos cost again)`);
  if (missing.length) { log('make these first:\n- ' + missing.join('\n- ') + (cmd === 'clips' ? '\n(lip-sync audio: node battle.mjs segments <project>)' : '')); return yes ? 1 : 0; }
  if (!list.length || !yes) { if (list.length) log('nothing sent. Add --yes to make them.'); return 0; }
  const apiKey = key('COMETAPI_KEY', env);
  let failed = 0;
  for (const j of list) {
    try {
      const f = j.kind === 'image' ? await makeImage({ prompt: j.prompt, refs: j.refs, out: j.out, apiKey, fetchFn })
        : j.kind === 'lipsync' ? await makeLipsync({ image: j.image, audio: j.audio, prompt: j.prompt, out: j.out, apiKey, fetchFn })
          : await makeMotion({ image: j.image, prompt: j.prompt, seconds: j.seconds, out: j.out, apiKey, fetchFn });
      log(`made ${path.relative(dir, f)}`);
    } catch (e) { failed++; log(`FAILED ${j.what}: ${e.message}`); }
  }
  log(failed ? `${failed} failed; run the same command again to retry only those` : 'all made. Look at every one before the next step.');
  return failed ? 1 : 0;
}
export { main };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (e) { console.error(String(e.message || e)); process.exitCode = 1; }
}
