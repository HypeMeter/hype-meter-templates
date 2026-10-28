// node test.mjs — the first part runs offline with no browser; the second part runs only if puppeteer is installed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { videoProblems, sampleTimes, loadPuppeteer, checkPage } from './check.mjs';
import { frameTimes, sheetTimes, ffmpegArgs, parseArgs, findFfmpeg, render } from './render.mjs';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };

await t('good VIDEO has no problems', () => assert.deepEqual(videoProblems({ width: 1080, height: 1920, fps: 30, seconds: 8 }), []));
await t('missing VIDEO is explained', () => assert.match(videoProblems(undefined)[0], /window.VIDEO is missing/));
await t('odd size is caught', () => assert.match(videoProblems({ width: 1081, height: 1920, fps: 30, seconds: 8 }).join(), /even/));
await t('zero seconds is caught', () => assert.match(videoProblems({ width: 1080, height: 1920, fps: 30, seconds: 0 }).join(), /seconds/));
await t('sample times: 9 moments, first and last frame included', () => assert.deepEqual(sampleTimes(2, 10), [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 1.9]));
await t('frame times cover from..to', () => { const f = frameTimes(10, 0, 1); assert.equal(f.length, 10); assert.equal(f[0], 0); assert.equal(f.at(-1), 0.9); });
await t('frame times for a slice', () => assert.deepEqual(frameTimes(10, 0.5, 0.8), [0.5, 0.6, 0.7]));
await t('sheet times start at 0 and end on the last frame', () => { const s = sheetTimes(8, 30); assert.equal(s.length, 8); assert.equal(s.at(-1), 7.967); assert.equal(s[0], 0); });
await t('ffmpeg args add silence when there is no audio', () => { const a = ffmpegArgs({ fps: 30, seconds: 5, out: 'x.mp4' }); assert.ok(a.includes('anullsrc=r=48000:cl=stereo')); assert.equal(a.at(-1), 'x.mp4'); assert.equal(a[a.indexOf('-t') + 1], '5'); });
await t('ffmpeg args use the audio file', () => { const a = ffmpegArgs({ fps: 30, seconds: 5, audio: 'v.mp3', out: 'x.mp4' }); assert.equal(a[a.indexOf('v.mp3') - 1], '-i'); assert.ok(!a.includes('lavfi')); });
await t('parse args', () => {
  const a = parseArgs(['page.html', '--out', 'o.mp4', '--audio', 'a.mp3', '--from', '1', '--to', '2.5', '--stills', '0,2.5']);
  assert.deepEqual([a.file, a.out, a.audio, a.from, a.to, a.stills], ['page.html', 'o.mp4', 'a.mp3', 1, 2.5, [0, 2.5]]);
  assert.equal(parseArgs(['--sheet', 's.jpg', 'p.html']).file, 'p.html');
});

let puppeteer = null;
try { puppeteer = loadPuppeteer(); } catch {}
if (!puppeteer) {
  console.log(`${n} passed (browser tests skipped: run "npm i puppeteer ffmpeg-static" in this folder to run them)`);
  process.exit(0);
}

// Browser tests: the template and examples pass; broken pages fail for the right reason.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'html-video-test-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const quiet = { puppeteer, log: () => {} };
const page = (name, body) => { const f = path.join(tmp, name); fs.writeFileSync(f, `<!doctype html><canvas></canvas><script>${body}</script>`); return f; };
const base = `const c=document.querySelector('canvas');c.width=320;c.height=180;const x=c.getContext('2d');window.VIDEO={width:320,height:180,fps:10,seconds:2};`;
const draw = `x.fillStyle='#123';x.fillRect(0,0,320,180);x.fillStyle='#fc3';x.fillRect(10+t*100,60,40,40);`;

const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['template.html', 'examples/how-video-works.html', 'examples/before-after-chart.html']) {
  await t(`${f} passes the checker`, async () => assert.deepEqual(await checkPage(path.join(here, f), quiet), []));
}
await t('a page in a folder with # and spaces works', async () => {
  const d = path.join(tmp, 'a b#c'); fs.mkdirSync(d);
  const f = path.join(d, 'x.html'); fs.copyFileSync(page('copy.html', base + `window.renderFrame=t=>{${draw}};`), f);
  assert.deepEqual(await checkPage(f, quiet), []);
});
await t('a good minimal page passes', async () => assert.deepEqual(await checkPage(page('good.html', base + `window.renderFrame=t=>{${draw}};`), quiet), []));
await t('Math.random is caught', async () => {
  const fails = await checkPage(page('random.html', base + `window.renderFrame=t=>{${draw}x.fillRect(Math.random()*300,0,20,20);};`), quiet);
  assert.ok(fails.some(f => /same time, same picture/.test(f)), fails.join('\n'));
});
await t('state kept between frames is caught', async () => {
  const fails = await checkPage(page('state.html', base + `let k=0;window.renderFrame=t=>{${draw}k+=20;x.fillRect(k%300,120,20,20);};`), quiet);
  assert.ok(fails.some(f => /same time, same picture/.test(f)), fails.join('\n'));
});
await t('blank first frame is caught with the preview hint', async () => {
  const fails = await checkPage(page('blank.html', base + `window.renderFrame=t=>{x.fillStyle='#000';x.fillRect(0,0,320,180);if(t>0.4){x.fillStyle='#fff';x.fillRect(t*50,50,40,40);}};`), quiet);
  assert.ok(fails.some(f => /blank.*preview people see/.test(f)), fails.join('\n'));
});
await t('loading from the internet is caught', async () => {
  const f = path.join(tmp, 'net.html');
  fs.writeFileSync(f, `<!doctype html><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><canvas></canvas><script>${base}window.renderFrame=t=>{${draw}};</script>`);
  const fails = await checkPage(f, quiet);
  assert.ok(fails.some(x => /internet/.test(x)), fails.join('\n'));
});
await t('missing renderFrame is caught', async () => {
  const fails = await checkPage(page('none.html', base), quiet);
  assert.ok(fails.some(x => /renderFrame/.test(x)), fails.join('\n'));
});
await t('wrong canvas size is caught', async () => {
  const fails = await checkPage(page('size.html', base.replace('c.width=320', 'c.width=300') + `window.renderFrame=t=>{${draw}};`), quiet);
  assert.ok(fails.some(x => /canvas is 320x180/.test(x)), fails.join('\n'));
});
await t('a missing picture is caught', async () => {
  const f = path.join(tmp, 'img.html');
  fs.writeFileSync(f, `<!doctype html><img hidden id="p" src="nope.jpg"><canvas></canvas><script>${base}window.renderFrame=t=>{${draw}};</script>`);
  const fails = await checkPage(f, quiet);
  assert.ok(fails.some(x => /missing nope.jpg/.test(x)), fails.join('\n'));
});

const ff = findFfmpeg();
if (spawnSync(ff, ['-version']).status !== 0) {
  console.log(`${n} passed (render tests skipped: ffmpeg not found)`);
  process.exit(0);
}
const probe = file => spawnSync(ff, ['-i', file], { encoding: 'utf8' }).stderr;
await t('renders an mp4 with the right size and length', async () => {
  const out = path.join(tmp, 'good.mp4');
  await render(path.join(tmp, 'good.html'), { out, puppeteer, log: () => {} });
  const info = probe(out);
  assert.match(info, /320x180/); assert.match(info, /Duration: 00:00:02\.0/); assert.match(info, /Audio: aac/);
});
await t('renders with an audio file', async () => {
  const wav = path.join(tmp, 'tone.wav');
  spawnSync(ff, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', wav]);
  const out = path.join(tmp, 'tone.mp4');
  await render(path.join(tmp, 'good.html'), { out, audio: wav, puppeteer, log: () => {} });
  assert.match(probe(out), /Duration: 00:00:02\.0/);
});
await t('stills and sheet are written', async () => {
  const cwd = process.cwd(); process.chdir(tmp);
  const r = await render(path.join(tmp, 'good.html'), { stills: [0, 1], puppeteer, log: () => {} });
  process.chdir(cwd);
  assert.deepEqual(r.stills, ['good-0.jpg', 'good-1.jpg']); r.stills = r.stills.map(f => path.join(tmp, f));
  assert.equal(r.stills.length, 2); r.stills.forEach(f => assert.ok(fs.statSync(f).size > 500));
  const sheet = path.join(tmp, 'sheet.jpg');
  await render(path.join(tmp, 'good.html'), { sheet, puppeteer, log: () => {} });
  assert.ok(fs.statSync(sheet).size > 1000);
});
await t('missing audio file is a clear error', async () => {
  await assert.rejects(render(path.join(tmp, 'good.html'), { out: path.join(tmp, 'x.mp4'), audio: path.join(tmp, 'nope.mp3'), puppeteer }), /audio file not found/);
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${n} passed`);
