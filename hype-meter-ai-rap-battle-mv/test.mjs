// node test.mjs — the first part runs offline and never calls a paid service; the last part also needs ffmpeg and puppeteer (npm i).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseLyrics, songPlan, webPrompt, readWords, alignLines, audioWindow, shotProblems, estimate, overlayHtml, overlayBreaks,
  loadProject, todoMarkdown, findFfmpeg, loadPuppeteer, cut, linesFromPlan, retime, motionSeconds, NEW_PROJECT,
} from './battle.mjs';
import { snakeKeys, musicRequest, imageExt, jobs, main as api, makeImage, makeLipsync, makeMotion, key } from './api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const EX = path.join(here, 'example', 'romeo-vs-shakespeare');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rap-battle-test-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const cfg = { end: 10, characters: { A: { voice: ['high'], avoid: ['low'], color: '#f0f' }, B: { voice: ['low'], sectionSeconds: 4 } }, both: { voice: ['together'] }, beat: ['trap'] };

await t('lyrics: headers, translations skipped, notes before the first header ignored, ## ends', () => {
  const s = parseLyrics('- a note\n[A, verse 1]\nhello there\n你好\n\n[B]\nbye now\n[Both]\nall of us\n## notes\n[A]\nignored');
  assert.deepEqual(s, [{ who: 'A', lines: ['hello there'] }, { who: 'B', lines: ['bye now'] }, { who: 'Both', lines: ['all of us'] }]);
});
await t('lyrics: two-word names and a translated name after it', () => {
  assert.deepEqual(parseLyrics('[Julius Caesar]\na\n[Mark Antony, verse 2]\nb\n[Romeo 羅密歐]\nc').map(s => s.who), ['Julius Caesar', 'Mark Antony', 'Romeo']);
});
await t('song plan: each section gets beat + its own voice; sectionSeconds wins', () => {
  const p = songPlan(cfg, parseLyrics('[A]\na\nb\n[B]\nc\n[Both]\nd'));
  assert.equal(p.chunks[0].text, '[Verse 1]\na\nb');
  assert.deepEqual(p.chunks[0].positiveStyles, ['trap', 'high']);
  assert.deepEqual(p.chunks[0].negativeStyles, ['low']);
  assert.equal(p.chunks[0].durationMs, 6000);
  assert.equal(p.chunks[1].durationMs, 4000);
  assert.equal(p.chunks[2].text, '[Chorus]\nd');
});
await t('song plan: unknown singer is a clear error', () => assert.throws(() => songPlan(cfg, parseLyrics('[Zed]\nx')), /characters.Zed/));
await t('web prompt lists every section with its voice', () => {
  const w = webPrompt(cfg, parseLyrics('[A]\na\n[B]\nb'));
  assert.match(w, /\[Verse 1\] \(Rapper 1\): high\. Not: low\./); assert.match(w, /\[Verse 2\] \(Rapper 2\): low\./);
  assert.ok(!/\(A\)|\(B\)/.test(w), 'singer names must not be in the web prompt');
});
await t('words: ElevenLabs JSON keeps only words', () => {
  const w = readWords(JSON.stringify({ words: [{ text: '[rapping]', start: 0, end: 1, type: 'audio_event' }, { text: 'Will,', start: 1, end: 1.2, type: 'word' }, { text: ' ', start: 1.2, end: 1.3, type: 'spacing' }] }));
  assert.deepEqual(w, [{ text: 'Will,', start: 1, end: 1.2 }]);
});
await t('words: SRT spreads each cue over its words', () => {
  const w = readWords('1\n00:00:01,000 --> 00:00:03,000\nhello big world\n\n2\n00:00:04,000 --> 00:00:05,000\nbye\n', 'x.srt');
  assert.equal(w.length, 4); assert.equal(w[0].start, 1); assert.equal(w[2].end, 3); assert.equal(w[3].start, 4);
});
const ex = loadProject(EX);
const exWords = readWords(fs.readFileSync(path.join(EX, 'words.json'), 'utf8'));
await t('align: the example song matches every line, in order', () => {
  const lines = alignLines(ex.sections, exWords, ex.cfg.end);
  assert.equal(lines.length, 20); assert.equal(lines.filter(l => l.guessed).length, 0);
  assert.ok(Math.abs(lines[0].t0 - 1.04) < 0.01); assert.ok(Math.abs(lines[4].t0 - 11.72) < 0.01);
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i].t0 >= lines[i - 1].t1 - 0.01, `line ${i} starts before the one before ends`);
});
await t('align: a line the transcript missed gets a time between its neighbours', () => {
  const sec = [{ who: 'A', lines: ['one two three', 'zebra quokka', 'four five six'] }];
  const w = ['one', 'two', 'three', 'four', 'five', 'six'].map((x, i) => ({ text: x, start: i, end: i + 0.5 }));
  const l = alignLines(sec, w, 10);
  assert.ok(l[1].guessed); assert.ok(l[1].t0 > l[0].t1 && l[1].t1 < l[2].t0);
});
await t('lip-sync audio window is at least 2 seconds', () => {
  assert.deepEqual(audioWindow({ t0: 1, t1: 2 }), [0.9, 2.9]);
  assert.deepEqual(audioWindow({ t0: 3.7, t1: 6.4, a0: 3.65, a1: 6.55 }), [3.65, 6.55]);
});
await t('the example shot list passes; the cost estimate is near what it really cost (USD 4.13)', () => {
  assert.deepEqual(shotProblems(ex, { songSeconds: 60 }), []);
  const e = estimate(ex); assert.ok(e.usd > 3.5 && e.usd < 4.5, String(e.usd));
});
const proj = shots => ({ dir: tmp, cfg: { end: 4, characters: { A: {} } }, shots });
await t('shot problems: gap, overlap, wrong end, bad type, missing prompt', () => {
  const p = shotProblems(proj([{ id: 'a', t0: 0, t1: 1, type: 'still' }, { id: 'b', t0: 1.5, t1: 3, type: 'motion', frame: 'x' }, { id: 'c', t0: 2.5, t1: 3.5, type: 'dance' }]));
  const all = p.join('\n');
  assert.match(all, /shot b: starts at 1.5.*gap/); assert.match(all, /shot c: starts at 2.5.*overlap/); assert.match(all, /type must be/);
  assert.match(all, /motion shots need "motion"/); assert.match(all, /last shot ends at 3.5 but "end" is 4/);
});
await t('shot problems: lip-sync longer than 60 s, unknown singer, past the song end', () => {
  const p = shotProblems({ dir: tmp, cfg: { end: 70, characters: { A: {} } }, shots: [{ id: 'x', t0: 0, t1: 70, type: 'lipsync', who: 'Q', frame: 'f' }] }, { songSeconds: 65 }).join('\n');
  assert.match(p, /limit is 60 s/); assert.match(p, /who "Q"/); assert.match(p, /song is only 65.0 s/);
});
await t('a still needs a picture prompt or an image', () => {
  assert.match(shotProblems(proj([{ id: 'a', t0: 0, t1: 4, type: 'still' }])).join(), /needs "frame"/);
});
await t('shot problems --final: missing clips are listed', () => {
  assert.match(shotProblems(ex, { final: true }).join('\n'), /shot s01: missing clip/);
});
await t('todo lists sheets, pictures and clips with file names', () => {
  const md = todoMarkdown(ex);
  assert.match(md, /cast\/romeo\.png/); assert.match(md, /frames\/s02\.png/); assert.match(md, /audio\/s03\.mp3` \(song 3\.65–6\.55 s\)/); assert.match(md, /MOTION 2 s/);
});
const lines = alignLines(ex.sections, exWords, ex.cfg.end);
await t('overlay: title first, then speaker tag, caption and cards', () => {
  assert.match(overlayHtml(1, { lines, cfg: ex.cfg }), /class=title.*ROMEO.*vs.*SHAKESPEARE/);
  const h = overlayHtml(13, { lines, cfg: ex.cfg });
  assert.match(h, /class=tag[^>]*>SHAKESPEARE/); assert.match(h, /WHEREFORE = WHY/); assert.match(h, /class=cap>Boy, &quot;wherefore&quot;|class=cap>Boy, "wherefore"/);
  assert.match(overlayHtml(50, { lines, cfg: ex.cfg }), /ROMEO × SHAKESPEARE/);
  const b = overlayBreaks({ lines, cfg: ex.cfg }); assert.equal(b[0], 0); assert.equal(b.at(-1), 59.4);
});

await t('before the song exists, line times come from the song plan', () => {
  const l = linesFromPlan(cfg, parseLyrics('[A]\na\nb\n[B]\nc'));
  assert.deepEqual(l.map(x => [x.t0, x.t1]), [[0, 2.9], [3, 5.9], [6, 9.9]]);
});

await t('retime: planned shots and cards move to the sung line times', () => {
  const planned = [{ t0: 0, t1: 2.9 }, { t0: 3, t1: 5.9 }, { t0: 6, t1: 8.9 }];
  const real = [{ t0: 1, t1: 3 }, { t0: 3.5, t1: 6 }, { t0: 7, t1: 9.5 }];
  const shots = [{ id: 'a', t0: 0, t1: 3, type: 'still' }, { id: 'b', t0: 3, t1: 6, type: 'lipsync', a0: 2.9, a1: 6.1 }, { id: 'c', t0: 6, t1: 9, type: 'still' }];
  const r = retime({ cfg: { end: 9, cards: [{ t0: 3, t1: 4.5, text: 'x' }] }, shots }, planned, real, 10);
  assert.deepEqual(r.shots.map(s => [s.t0, s.t1]), [[0, 3.5], [3.5, 7], [7, 10]]);
  assert.ok(r.shots[1].a0 < 3.5 && r.shots[1].a1 > 7); assert.deepEqual([r.cards[0].t0, r.end], [3.5, 10]);
  assert.deepEqual(shotProblems({ dir: tmp, cfg: { end: 10, characters: {} }, shots: r.shots.map(s => ({ ...s, frame: 'f' })) }), []);
});
await t('motion clip length covers the shot plus the 0.2 s skipped at its start', () => {
  assert.equal(motionSeconds({ t0: 0, t1: 2.9 }), 4); assert.equal(motionSeconds({ t0: 0, t1: 2.5 }), 3); assert.equal(motionSeconds({ t0: 0, t1: 1 }), 2);
  assert.deepEqual(shotProblems(proj([{ id: 'm', t0: 0, t1: 4, type: 'motion', frame: 'f', motion: 'm' }])), []);
});
await t('new project files parse and plan', () => {
  const c = JSON.parse(NEW_PROJECT['project.json']);
  assert.equal(songPlan(c, parseLyrics(NEW_PROJECT['lyrics.md'])).chunks.length, 5);
});

// ---------- api.mjs, with no network: every request goes to a fake ----------
const noNet = () => { throw new Error('tried to use the network'); };
await t('api: camelCase plan becomes the snake_case ElevenLabs body', () => {
  assert.deepEqual(snakeKeys({ chunks: [{ durationMs: 1, positiveStyles: ['a'] }] }), { chunks: [{ duration_ms: 1, positive_styles: ['a'] }] });
  const r = musicRequest({ chunks: [{ text: 'x', durationMs: 500 }] }, 'k');
  assert.equal(r.headers['xi-api-key'], 'k'); assert.deepEqual(JSON.parse(r.body).composition_plan.chunks[0], { text: 'x', duration_ms: 500 });
});
await t('api: image type comes from the bytes, not the name', () => {
  assert.equal(imageExt(Buffer.from([0xff, 0xd8, 0xff, 0])), '.jpg');
  assert.equal(imageExt(Buffer.from('\x89PNG\r\n', 'binary')), '.png');
});
await t('api: without --yes nothing is sent, and the cost is printed', async () => {
  const out = [];
  for (const cmd of ['song', 'cast']) assert.equal(await api([cmd, EX], { fetchFn: noNet, log: x => out.push(x), env: {} }), 0);
  assert.match(out.join('\n'), /nothing sent/); assert.match(out.join('\n'), /sheet Romeo +about USD 0\.02/);
});
await t('api: clips are not sent while their pictures are missing', async () => {
  const out = [];
  assert.equal(await api(['clips', EX, '--yes'], { fetchFn: noNet, log: x => out.push(x), env: { COMETAPI_KEY: 'k' } }), 1);
  assert.match(out.join('\n'), /make these first/);
});
await t('api: clips report a missing first picture even when the audio exists', async () => {
  const d = path.join(tmp, 'clipcheck'); fs.cpSync(EX, d, { recursive: true });
  fs.mkdirSync(path.join(d, 'audio')); fs.writeFileSync(path.join(d, 'audio', 's01.mp3'), 'x');
  const out = [];
  assert.equal(await api(['clips', d, '--only', 's01'], { fetchFn: noNet, log: x => out.push(x), env: {} }), 0);
  assert.match(out.join('\n'), /lip-sync s01: missing its first picture/);
});
await t('api: jobs skip what exists and respect --only', () => {
  const j = jobs(ex, 'frames', ['s02', 's03']); assert.deepEqual(j.map(x => x.what), ['frame s02', 'frame s03']);
  assert.ok(j[0].prompt.endsWith('no watermark.')); assert.match(j[1].refs[0], /cast\/romeo\.png$/);
});
await t('api: a lip-sync shot without refs still uploads its singer\'s sheet', () => {
  const p = { ...ex, shots: [{ id: 'z', t0: 0, t1: 2, type: 'lipsync', who: 'Romeo', frame: 'f' }] };
  assert.match(jobs(p, 'frames')[0].refs[0], /cast\/romeo\.png$/);
});
await t('api: --only without ids is a usage error, not a crash', async () => {
  assert.equal(await api(['frames', EX, '--only'], { fetchFn: noNet, log: () => {}, env: {} }), 2);
});
await t('api: a missing key says how to set it', () => assert.throws(() => key('COMETAPI_KEY', {}), /export COMETAPI_KEY=/));

const ok = (body, extra = {}) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))), ...extra });
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2000)]);
const img = path.join(tmp, 'f.png'); fs.writeFileSync(img, Buffer.from('\x89PNG\r\n', 'binary'));
const snd = path.join(tmp, 'a.mp3'); fs.writeFileSync(snd, 'ID3');
await t('api: picture saved as .jpg when JPEG comes back', async () => {
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString('base64');
  const f = await makeImage({ prompt: 'p', refs: [img], out: path.join(tmp, 'frames', 's01.png'), apiKey: 'k', fetchFn: async () => ok({ candidates: [{ content: { parts: [{ inlineData: { data: jpg } }] } }] }) });
  assert.ok(f.endsWith('s01.jpg'));
});
await t('api: lip-sync submits, polls until done, downloads', async () => {
  const seen = []; let polls = 0;
  const fetchFn = async (url, o) => {
    seen.push(o.method + ' ' + url.replace(/^https:\/\/[^/]+/, ''));
    if (o.method === 'POST') { const b = JSON.parse(o.body); assert.equal(b.mode, 'std'); assert.ok(b.image && b.sound_file); return ok({ code: 0, data: { task_id: 'T1' } }); }
    if (url.includes('/T1')) return ok({ code: 0, data: ++polls < 2 ? { task_status: 'processing' } : { task_status: 'succeed', task_result: { videos: [{ url: 'https://cdn.example/v.mp4' }] } } });
    return ok(MP4);
  };
  const out = path.join(tmp, 'clips', 'ls.mp4');
  await makeLipsync({ image: img, audio: snd, prompt: 'raps', out, apiKey: 'k', fetchFn, wait: async () => {} });
  assert.deepEqual(seen, ['POST /kling/v1/videos/avatar/image2video', 'GET /kling/v1/videos/avatar/image2video/T1', 'GET /kling/v1/videos/avatar/image2video/T1', 'GET /v.mp4']);
  assert.equal(fs.statSync(out).size, MP4.length);
});
await t('api: motion clip submits a form, polls, downloads; a failed task is an error', async () => {
  const fetchFn = async (url, o) => {
    if (o.method === 'POST') { assert.equal(o.body.get('model'), 'wan3.0'); assert.equal(o.body.get('size'), '480x832'); return ok({ id: 'V1' }); }
    if (url.endsWith('/V1')) return ok({ status: 'completed' });
    return ok(MP4);
  };
  await makeMotion({ image: img, prompt: 'p', seconds: 3, out: path.join(tmp, 'clips', 'm.mp4'), apiKey: 'k', fetchFn, wait: async () => {} });
  const bad = async (url, o) => o.method === 'POST' ? ok({ id: 'V2' }) : ok({ status: 'failed', error: { message: 'nsfw' } });
  await assert.rejects(makeMotion({ image: img, prompt: 'p', seconds: 3, out: path.join(tmp, 'x.mp4'), apiKey: 'k', fetchFn: bad, wait: async () => {} }), /video failed: nsfw/);
});

// ---------- the free tools end to end (needs ffmpeg and puppeteer) ----------
let puppeteer = null;
try { puppeteer = loadPuppeteer(); } catch {}
const ff = findFfmpeg();
if (!puppeteer || spawnSync(ff, ['-version']).status !== 0) {
  console.log(`${n} passed (video tests skipped: run "npm i" in this folder to run them)`);
  process.exit(0);
}
await t('preview cut of the first 12 seconds (including a still whose picture is missing), with no pictures or song yet', async () => {
  const d = path.join(tmp, 'mini');
  fs.cpSync(EX, d, { recursive: true });
  const shots = JSON.parse(fs.readFileSync(path.join(d, 'shots.json'))).shots.filter(s => s.t1 <= 12);
  fs.writeFileSync(path.join(d, 'shots.json'), JSON.stringify({ shots }));
  const c = JSON.parse(fs.readFileSync(path.join(d, 'project.json'))); c.end = 12; c.cards = c.cards.filter(k => k.t1 <= 12); fs.writeFileSync(path.join(d, 'project.json'), JSON.stringify(c));
  const p = loadProject(d);
  fs.writeFileSync(path.join(d, 'lines.json'), JSON.stringify(alignLines(p.sections, exWords, 12).filter(l => l.t0 < 12)));
  const r = await cut(p, { preview: true, puppeteer, log: () => {} });
  assert.equal(r.cards, 7); assert.equal(r.song, false);
  const info = spawnSync(ff, ['-i', r.out], { encoding: 'utf8' }).stderr;
  assert.match(info, /1080x1920/); assert.match(info, /Duration: 00:00:12\.0/);
});
await t('final cut refuses to run while clips are missing', async () => {
  await assert.rejects(cut(loadProject(path.join(tmp, 'mini')), { puppeteer }), /missing clip/);
});
console.log(`${n} passed`);
