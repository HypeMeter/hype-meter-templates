#!/usr/bin/env node
// Check a video page before rendering: it loads offline with no errors, window.VIDEO is sane,
// renderFrame(t) draws the same picture for the same t (in any order), frames are not blank, and something moves.
//   node check.mjs page.html
// Needs puppeteer once: run "npm i" in this folder   (or set PUPPETEER_MODULE to an installed copy, CHROME_PATH to your Chrome)
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
export const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
// PUPPETEER_MODULE wins when it is set; otherwise the copy that "npm i" put in this skill's folder.
export function loadPuppeteer(env = process.env) {
  for (const id of [env.PUPPETEER_MODULE, 'puppeteer'].filter(Boolean)) {
    try { return require(id); } catch {}
  }
  throw new Error(`puppeteer not found: run "npm i" in ${SKILL_DIR} (or set PUPPETEER_MODULE)`);
}
// File access flags let a page draw its own local pictures on the canvas and still be saved as frames.
export const launchOpts = (env = process.env) => ({
  headless: true, protocolTimeout: 600000,
  args: ['--allow-file-access-from-files', '--disable-web-security'],
  ...(env.CHROME_PATH ? { executablePath: env.CHROME_PATH } : {}),
});

// Problems with window.VIDEO, as plain sentences. Empty list = fine.
export function videoProblems(v) {
  if (!v || typeof v !== 'object') return ['window.VIDEO is missing (set window.VIDEO = { width, height, fps, seconds })'];
  const p = [];
  for (const k of ['width', 'height', 'fps', 'seconds']) if (!(Number.isFinite(v[k]) && v[k] > 0)) p.push(`window.VIDEO.${k} must be a number above 0`);
  if (p.length) return p;
  if (v.width % 2 || v.height % 2) p.push('width and height must be even numbers (mp4 needs it)');
  if (v.width > 3840 || v.height > 3840) p.push('width and height should be 3840 or less');
  if (v.fps > 60) p.push('fps should be 60 or less (30 is plenty)');
  if (v.seconds > 600) p.push('seconds should be 600 or less; split longer videos into parts');
  return p;
}

// Times to test: 9 moments from the first frame to the very last one.
export function sampleTimes(seconds, fps) {
  const last = (Math.round(seconds * fps) - 1) / fps;
  return [...new Set(Array.from({ length: 9 }, (_, i) => +(i === 8 ? last : seconds * i / 8).toFixed(4)))];
}

export async function openPage(browser, file, { errors = [] } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  // Anything from the internet is reported and blocked, so the check never waits on the network.
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (/^(file|data|blob|about):/.test(r.url())) return r.continue();
    errors.push('loads from the internet: ' + r.url()); r.abort();
  });
  page.on('requestfailed', r => { if (/^file:/.test(r.url())) errors.push('failed to load ' + r.url()); });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(pathToFileURL(path.resolve(file)).href + '?render', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// Draw time t, then shrink the frame to 96 px wide and return its pixels plus how many distinct colors it has.
async function snapshot(page, t) {
  return page.evaluate(t => {
    window.renderFrame(t);
    const src = document.querySelector('canvas');
    const w = 96, h = Math.max(1, Math.round(96 * src.height / src.width));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4) colors.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4);
    return { pixels: Array.from(d).join(','), colors: colors.size };
  }, t);
}

export async function checkPage(file, { puppeteer = loadPuppeteer(), log = console.log } = {}) {
  const browser = await puppeteer.launch(launchOpts());
  const fails = [];
  const ok = (cond, label) => { log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fails.push(label); return cond; };
  try {
    const errors = [];
    const page = await openPage(browser, file, { errors });
    const v = await page.evaluate(() => window.VIDEO);
    const problems = videoProblems(v);
    ok(problems.length === 0, problems.length ? problems.join('; ') : `window.VIDEO: ${v.width}x${v.height}, ${v.fps} fps, ${v.seconds} s (${Math.round(v.seconds * v.fps)} frames)`);
    if (!ok(await page.evaluate(() => typeof window.renderFrame === 'function'), 'window.renderFrame(t) exists')) return fails;
    if (problems.length) return fails;
    const size = await page.evaluate(() => { const c = document.querySelector('canvas'); return c && [c.width, c.height]; });
    if (!ok(size && size[0] === v.width && size[1] === v.height, `canvas is ${v.width}x${v.height}${size ? ` (found ${size.join('x')})` : ' (no <canvas> found)'}`)) return fails;
    const broken = await page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')));
    ok(broken.length === 0, `all pictures loaded${broken.length ? ': missing ' + broken.join(', ') : ''}`);

    const times = sampleTimes(v.seconds, v.fps);
    const first = {}, drawErrors = [];
    for (const t of times) {
      try { first[t] = await snapshot(page, t); } catch (e) { drawErrors.push(`t=${t}: ${String(e.message || e).split('\n')[0]}`); }
    }
    if (!ok(drawErrors.length === 0, `renderFrame runs at t = ${times.join(', ')}${drawErrors.length ? ': ' + drawErrors.join(' | ') : ''}`)) return fails;
    // Same t again, in reverse order: a page that uses Math.random, the clock, or remembers the last frame will differ.
    const changed = [];
    for (const t of [...times].reverse()) if ((await snapshot(page, t)).pixels !== first[t].pixels) changed.push(t);
    ok(changed.length === 0, `same time, same picture${changed.length ? ` (differs at t = ${changed.join(', ')}: remove Math.random/Date.now or state kept between frames)` : ''}`);
    const blank = times.filter(t => first[t].colors < 2);
    ok(blank.length === 0, `no blank frames${blank.length ? ` (one flat color at t = ${blank.join(', ')}${blank.includes(0) ? '; the first frame is the preview people see before they tap, so show the hook at t = 0' : ''})` : ''}`);
    ok(new Set(times.map(t => first[t].pixels)).size > 1, 'something changes over time');
    ok(errors.length === 0, `no console errors or internet loads${errors.length ? ': ' + [...new Set(errors)].slice(0, 3).join(' | ') : ''}`);
  } finally { await browser.close(); }
  return fails;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('usage: node check.mjs page.html'); process.exit(2); }
  const fails = await checkPage(file);
  console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
}
