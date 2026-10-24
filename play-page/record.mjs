#!/usr/bin/env node
// Record a vertical clip of a play page: hold, then sweep each slider start→end, cycle each select, press each button.
//   node record.mjs page.html --out clip.mp4 [--fps 15] [--width 540 --height 960]   (saved at 2x: 1080x1920)
// Needs puppeteer and ffmpeg once: npm i puppeteer ffmpeg-static   (or set PUPPETEER_MODULE / FFMPEG_PATH, CHROME_PATH)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { loadPuppeteer, launchOpts } from './check.mjs';

const require = createRequire(import.meta.url);
export function findFfmpeg(env = process.env) {
  if (env.FFMPEG_PATH) return env.FFMPEG_PATH;
  try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; }
}

// A page can script its own demo: <script type="application/json" id="demo">[{"set":{"spin":0},"sweep":{"days":[0,27.3]},"seconds":5}]</script>
// Each step sets controls (by id) at its first frame, then eases the sweep controls from→to over `seconds`. Pure, so it can be tested.
export function planDemo(steps, ids, { fps = 15, hold = 1.2 } = {}) {
  const frames = [], idx = id => { const i = ids.indexOf(id); if (i < 0) throw new Error(`demo: no control with id "${id}"`); return i; };
  for (let k = 0; k < Math.round(hold * fps); k++) frames.push({});
  for (const st of steps) {
    const n = Math.max(1, Math.round((st.seconds ?? 3) * fps));
    for (let k = 0; k < n; k++) {
      const f = {};
      if (k === 0) for (const [id, v] of Object.entries(st.set || {})) f[idx(id)] = String(v);
      const t = n === 1 ? 1 : k / (n - 1), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      for (const [id, [a, b]] of Object.entries(st.sweep || {})) f[idx(id)] = String(+(a + (b - a) * e).toFixed(4));
      frames.push(f);
    }
  }
  for (let k = 0; k < Math.round(hold * fps); k++) frames.push({});
  return frames;
}

// Default timeline when the page has no demo: a list of frames, each a list of control values to apply.
export function plan(controls, { fps = 15, hold = 1.5, sweep = 4, step = 1.2 } = {}) {
  const frames = [];
  const start = Object.fromEntries(controls.map(c => [c.i, c.value]));
  const push = (n, fn) => { for (let k = 0; k < n; k++) frames.push(fn(k, n)); };
  push(Math.round(hold * fps), () => ({}));
  for (const c of controls) {
    if (c.tag === 'INPUT') {
      const lo = Number(c.min), hi = Number(c.max), st = Number(c.step) || (hi - lo) / 100;
      push(Math.round(sweep * fps), (k, n) => {
        const t = k / (n - 1), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const v = lo + (hi - lo) * e;
        return { [c.i]: String(Math.round((v - lo) / st) * st + lo) };
      });
      push(Math.round(0.8 * fps), () => ({}));
      push(1, () => ({ [c.i]: start[c.i] }));
    } else if (c.tag === 'SELECT') {
      for (const v of c.options) push(Math.round(step * fps), (k) => (k === 0 ? { [c.i]: v } : {}));
      push(1, () => ({ [c.i]: start[c.i] }));
    } else {
      push(Math.round(step * fps), (k) => (k === 0 ? { [c.i]: 'click' } : {}));
    }
  }
  push(Math.round(hold * fps), () => ({}));
  return frames;
}

export async function record(file, { out = 'clip.mp4', fps = 15, width = 540, height = 960, puppeteer = loadPuppeteer() } = {}) {
  const browser = await puppeteer.launch(launchOpts());
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
    const controls = await page.$$eval('input[type=range], select, button', els => els.map((el, i) => ({
      i, tag: el.tagName, id: el.id, min: el.min, max: el.max, step: el.step, value: el.value,
      options: el.tagName === 'SELECT' ? [...el.options].map(o => o.value) : [],
    })));
    const demo = await page.$eval('script#demo[type="application/json"]', el => el.textContent).catch(() => null);
    const frames = demo ? planDemo(JSON.parse(demo), controls.map(c => c.id), { fps }) : plan(controls, { fps });
    const ff = spawn(findFfmpeg(), ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', out],
      { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = ''; ff.stderr.on('data', d => { ffErr = (ffErr + d).slice(-2000); });
    const done = new Promise((res, rej) => ff.on('close', code => code === 0 ? res() : rej(new Error('ffmpeg failed: ' + ffErr))));
    for (const f of frames) {
      if (Object.keys(f).length) await page.evaluate(f => {
        const els = document.querySelectorAll('input[type=range], select, button');
        for (const [i, v] of Object.entries(f)) {
          const el = els[i];
          if (v === 'click') { el.click(); continue; }
          el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, f);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 90 });
      if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    return { out, frames: frames.length, seconds: frames.length / fps };
  } finally { await browser.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a) && a.endsWith('.html'));
  const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
  if (!file || !fs.existsSync(file)) { console.error('usage: node record.mjs page.html --out clip.mp4'); process.exit(2); }
  const r = await record(file, { out: opt('out') || 'clip.mp4', fps: Number(opt('fps') || 15), width: Number(opt('width') || 540), height: Number(opt('height') || 960) });
  console.log(`wrote ${r.out} (${r.seconds.toFixed(1)} s, ${r.frames} frames)`);
}
