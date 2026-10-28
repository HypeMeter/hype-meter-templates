#!/usr/bin/env node
// Turn a video page into an mp4: call renderFrame(t) for every frame, save the canvas, pipe the frames to ffmpeg.
//   node render.mjs page.html --out video.mp4 [--audio sound.mp3] [--from 0 --to 3]
//   node render.mjs page.html --stills 0,2.5,5          → page-0.jpg, page-2.5.jpg, page-5.jpg (look before a full render)
//   node render.mjs page.html --sheet sheet.jpg         → 8 frames on one picture
// Needs puppeteer and ffmpeg once: run "npm i" in this folder   (or set PUPPETEER_MODULE / FFMPEG_PATH, CHROME_PATH)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { loadPuppeteer, launchOpts, openPage, videoProblems, SKILL_DIR } from './check.mjs';

const require = createRequire(import.meta.url);
export function findFfmpeg(env = process.env) {
  if (env.FFMPEG_PATH) return env.FFMPEG_PATH;
  try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; }
}

// Frame times from `from` up to (not including) `to`.
export function frameTimes(fps, from, to) {
  const a = Math.round(from * fps), b = Math.round(to * fps);
  return Array.from({ length: Math.max(0, b - a) }, (_, i) => (a + i) / fps);
}

// Evenly spread times for a contact sheet, from the first frame (the preview people see) to the last one.
export function sheetTimes(seconds, fps, n = 8) {
  const last = (Math.round(seconds * fps) - 1) / fps;
  return Array.from({ length: n }, (_, i) => +(last * i / (n - 1)).toFixed(3));
}

export function ffmpegArgs({ fps, seconds, audio, out }) {
  const sound = audio ? ['-i', audio] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  return ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', ...sound,
    '-map', '0:v', '-map', '1:a', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k', '-t', String(seconds), '-movflags', '+faststart', out];
}

export function parseArgs(argv) {
  const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
  const file = argv.find((a, i) => a.endsWith('.html') && !(i > 0 && argv[i - 1].startsWith('--')));
  const num = k => opt(k) === undefined ? undefined : Number(opt(k));
  return {
    file, out: opt('out'), audio: opt('audio'), sheet: opt('sheet'), from: num('from'), to: num('to'),
    stills: opt('stills') ? opt('stills').split(',').map(Number) : undefined,
  };
}

const grab = (page, t, q = 0.93) => page.evaluate((t, q) => { window.renderFrame(t); return document.querySelector('canvas').toDataURL('image/jpeg', q); }, t, q)
  .then(d => Buffer.from(d.split(',')[1], 'base64'));

export async function render(file, { out = 'video.mp4', audio, from = 0, to, stills, sheet, puppeteer = loadPuppeteer(), log = console.log } = {}) {
  if (audio && !fs.existsSync(audio)) throw new Error(`audio file not found: ${audio}`);
  const browser = await puppeteer.launch(launchOpts());
  try {
    const errors = [];
    const page = await openPage(browser, file, { errors });
    const v = await page.evaluate(() => window.VIDEO);
    const problems = videoProblems(v);
    if (problems.length) throw new Error(problems.join('; ') + ' (run check.mjs first)');
    const base = path.basename(file, '.html'); // stills land in the folder you run from, like --sheet and --out

    if (stills) {
      const files = [];
      for (const t of stills) { const f = `${base}-${t}.jpg`; fs.writeFileSync(f, await grab(page, t)); files.push(f); }
      return { stills: files };
    }
    if (sheet) {
      const times = sheetTimes(v.seconds, v.fps);
      const shots = [];
      for (const t of times) shots.push((await grab(page, t, 0.85)).toString('base64'));
      // Build the grid inside the page so no extra tools are needed.
      const data = await page.evaluate(async (shots, times, W, H) => {
        const cols = W >= H ? 2 : 4, rows = Math.ceil(shots.length / cols), w = W >= H ? 640 : 360, h = Math.round(w * H / W), pad = 8, label = 30;
        const c = document.createElement('canvas'); c.width = cols * (w + pad) + pad; c.height = rows * (h + label + pad) + pad;
        const x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < shots.length; i++) {
          const im = new Image(); im.src = 'data:image/jpeg;base64,' + shots[i]; await im.decode();
          const cx = pad + (i % cols) * (w + pad), cy = pad + Math.floor(i / cols) * (h + label + pad);
          x.fillStyle = '#ddd'; x.font = '20px system-ui, sans-serif'; x.fillText(times[i].toFixed(2) + ' s', cx + 4, cy + 22);
          x.drawImage(im, cx, cy + label, w, h);
        }
        return c.toDataURL('image/jpeg', 0.88);
      }, shots, times, v.width, v.height);
      fs.writeFileSync(sheet, Buffer.from(data.split(',')[1], 'base64'));
      return { sheet };
    }

    const end = Math.min(to ?? v.seconds, v.seconds);
    const times = frameTimes(v.fps, from, end);
    if (!times.length) throw new Error(`nothing to render between ${from} s and ${end} s`);
    const ff = spawn(findFfmpeg(), ffmpegArgs({ fps: v.fps, seconds: times.length / v.fps, audio, out }), { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = ''; ff.stderr.on('data', d => { ffErr = (ffErr + d).slice(-2000); });
    const done = new Promise((res, rej) => {
      ff.on('error', e => rej(new Error(`ffmpeg not found: run "npm i" in ${SKILL_DIR} (or set FFMPEG_PATH). ` + e.message)));
      ff.on('close', code => code === 0 ? res() : rej(new Error('ffmpeg failed: ' + ffErr)));
    });
    ff.stdin.on('error', () => {});
    const started = Date.now();
    let shown = 0;
    for (let i = 0; i < times.length; i++) {
      if (!ff.stdin.write(await grab(page, times[i]))) await new Promise(r => ff.stdin.once('drain', r));
      const pct = Math.floor((i + 1) / times.length * 10) * 10;
      if (pct > shown) { shown = pct; log(`${pct}%  (${i + 1}/${times.length} frames, ${((Date.now() - started) / 1000).toFixed(0)} s)`); }
    }
    ff.stdin.end();
    await done;
    if (errors.length) log('page errors while rendering:\n' + [...new Set(errors)].slice(0, 5).join('\n'));
    return { out, frames: times.length, seconds: times.length / v.fps, took: (Date.now() - started) / 1000 };
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.file || !fs.existsSync(a.file)) { console.error('usage: node render.mjs page.html --out video.mp4 [--audio sound.mp3] | --stills 0,2.5 | --sheet sheet.jpg'); process.exit(2); }
  try {
    const name = path.basename(a.file, '.html'), slice = a.from !== undefined || a.to !== undefined ? `-${a.from ?? 0}-${a.to ?? 'end'}` : '';
    const r = await render(a.file, { ...a, out: a.out || `${name}${slice}.mp4` });
    if (r.stills) console.log('wrote ' + r.stills.join(', '));
    else if (r.sheet) console.log('wrote ' + r.sheet);
    else console.log(`wrote ${r.out} (${r.seconds.toFixed(1)} s, ${r.frames} frames, took ${r.took.toFixed(0)} s)`);
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
