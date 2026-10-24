#!/usr/bin/env node
// Check a play page: no console errors, no sideways scroll at phone or laptop width,
// and every control (range, select, button) changes the [data-result] sentence without NaN/undefined.
//   node check.mjs page.html
// Needs puppeteer once: npm i puppeteer   (or set PUPPETEER_MODULE to an installed copy, CHROME_PATH to your Chrome)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
export function loadPuppeteer(env = process.env) {
  for (const id of ['puppeteer', env.PUPPETEER_MODULE].filter(Boolean)) {
    try { return require(id); } catch {}
  }
  throw new Error('puppeteer not found: run "npm i puppeteer" in this folder (or set PUPPETEER_MODULE)');
}
export const launchOpts = (env = process.env) => ({ headless: true, ...(env.CHROME_PATH ? { executablePath: env.CHROME_PATH } : {}) });
export const BAD = /NaN|undefined|Infinity|\[object /;

export async function checkPage(file, { puppeteer = loadPuppeteer(), widths = [390, 1280], log = console.log } = {}) {
  const url = 'file://' + path.resolve(file);
  const browser = await puppeteer.launch(launchOpts());
  const fails = [];
  const ok = (cond, label) => { log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fails.push(label); };
  try {
    for (const width of widths) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => m.type() === 'error' && errors.push(m.text()));
      page.on('requestfailed', r => errors.push('failed to load ' + r.url()));
      page.on('request', r => { if (!/^(file|data|blob|about):/.test(r.url())) errors.push('loads from the internet: ' + r.url()); });
      await page.setViewport({ width, height: 900 });
      await page.goto(url, { waitUntil: 'load' });
      const result = () => page.$eval('[data-result]', el => el.textContent.trim()).catch(() => '');
      const first = await result();
      ok(first.length > 10, `[${width}px] result sentence ([data-result]) has text`);
      ok(!BAD.test(first), `[${width}px] result has no NaN/undefined`);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      ok(!sideways, `[${width}px] no sideways scrolling`);
      const controls = await page.$$eval('input[type=range], select, button', els => els.map((el, i) => ({
        i, tag: el.tagName, type: el.type, id: el.id, min: el.min, max: el.max, step: el.step, value: el.value,
        options: el.tagName === 'SELECT' ? [...el.options].map(o => o.value) : [],
      })));
      ok(controls.length > 0, `[${width}px] found ${controls.length} control(s)`);
      for (const c of controls) {
        const name = c.id ? '#' + c.id : `${c.tag.toLowerCase()} ${c.i + 1}`;
        const before = await result();
        await page.evaluate(c => {
          const el = document.querySelectorAll('input[type=range], select, button')[c.i];
          if (c.tag === 'BUTTON') { el.click(); return; }
          if (c.tag === 'SELECT') el.value = c.options.find(v => v !== el.value) ?? el.value;
          else el.value = String(Number(el.value) === Number(c.max) ? c.min : c.max);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, c);
        await new Promise(r => setTimeout(r, 150));
        const after = await result();
        ok(after !== before, `[${width}px] ${name} changes the result`);
        ok(!BAD.test(after), `[${width}px] ${name} result has no NaN/undefined`);
      }
      ok(errors.length === 0, `[${width}px] no console errors or network loads${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
      await page.close();
    }
  } finally { await browser.close(); }
  return fails;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('usage: node check.mjs page.html'); process.exit(2); }
  const fails = await checkPage(file);
  console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
}
