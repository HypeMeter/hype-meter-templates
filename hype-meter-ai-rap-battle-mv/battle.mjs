#!/usr/bin/env node
// Free, local steps for an AI rap battle music video. Nothing here calls a paid service.
//   node battle.mjs plan <project>      lyrics.md → song-plan.json (one voice style per section) + song-prompt.txt for the web
//   node battle.mjs lines <project>     words.json or words.srt (timed transcript of the song) → lines.json (when each lyric line is sung)
//   node battle.mjs todo <project>      todo.md: every picture and clip to make, with prompts, file names and a cost estimate
//   node battle.mjs segments <project>  cuts the song into audio/<shot>.mp3 for the lip-sync shots
//   node battle.mjs check <project>     finds gaps, overlaps and missing files (add --final before the last cut)
//   node battle.mjs cut <project>       lyric captions + shots + song → build/<name>.mp4 (add --preview to fill missing clips with stills or cards)
// segments and cut need ffmpeg, cut also needs puppeteer: run "npm i" in this folder once (or set FFMPEG_PATH / PUPPETEER_MODULE / CHROME_PATH).
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
export function findFfmpeg(env = process.env) {
  if (env.FFMPEG_PATH) return env.FFMPEG_PATH;
  try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; }
}
export const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
// PUPPETEER_MODULE wins when it is set; otherwise the copy that "npm i" put in this skill's folder.
export function loadPuppeteer(env = process.env) {
  for (const id of [env.PUPPETEER_MODULE, 'puppeteer'].filter(Boolean)) {
    try { return require(id); } catch {}
  }
  throw new Error(`puppeteer not found: run "npm i" in ${SKILL_DIR} (or set PUPPETEER_MODULE)`);
}
const launchOpts = (env = process.env) => ({ headless: true, ...(env.CHROME_PATH ? { executablePath: env.CHROME_PATH } : {}) });

export const W = 1080, H = 1920, FPS = 30;
export const PRICES = { lipsyncPerSecond: 0.0532, motionPerSecond: 0.05, image: 0.02 }; // USD, CometAPI list prices we paid in Oct 2026
export const LIPSYNC_SECONDS = [2, 60];

// ---------- lyrics ----------
// Sections start with a line like "[Romeo]" or "[Romeo, verse 1]". Lines until the next header are sung by that character.
// "Both" means everyone together. Lines with Chinese/Japanese/Korean characters (translations) are skipped; a "## " heading ends the lyrics.
export function parseLyrics(md) {
  const sections = [];
  let cur = null;
  for (const raw of md.split(/\r?\n/)) {
    const l = raw.trim();
    if (/^##\s/.test(l) && sections.length) break;
    // "[Julius Caesar]" and "[Julius Caesar, verse 2]" both mean Julius Caesar; a translated name after it ("[Romeo 羅密歐]") is ignored.
    const h = l.match(/^\[([^\]]+)\]$/);
    if (h) { cur = { who: h[1].split(',')[0].replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g, '').trim(), lines: [] }; sections.push(cur); continue; }
    if (!cur || !l || /[぀-ヿ㐀-鿿가-힯]/.test(l) || /^(#|>|- )/.test(l)) continue;
    cur.lines.push(l);
  }
  return sections.filter(s => s.lines.length);
}

export function loadProject(dir) {
  const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const cfg = JSON.parse(read('project.json'));
  const sections = parseLyrics(read(cfg.lyrics || 'lyrics.md'));
  const shots = fs.existsSync(path.join(dir, 'shots.json')) ? JSON.parse(read('shots.json')).shots : [];
  return { dir, cfg, sections, shots, name: cfg.name || path.basename(path.resolve(dir)) };
}

// ElevenLabs Music composition plan: each section gets the shared beat styles plus that character's voice styles,
// which is what makes two rappers sound like two different people in one song.
export function songPlan(cfg, sections) {
  const perLine = cfg.secondsPerLine ?? 2.9;
  let verse = 0;
  const chunks = sections.map(s => {
    const c = s.who === 'Both' ? cfg.both ?? {} : cfg.characters?.[s.who];
    if (!c) throw new Error(`lyrics.md has a [${s.who}] section but project.json has no characters.${s.who}`);
    const label = s.who === 'Both' ? 'Chorus' : `Verse ${++verse}`;
    return {
      text: `[${label}]\n` + s.lines.join('\n'),
      durationMs: Math.round((c.sectionSeconds ?? s.lines.length * perLine) * 2) * 500,
      positiveStyles: [...(cfg.beat ?? []), ...(c.voice ?? [])],
      negativeStyles: c.avoid ?? [],
    };
  });
  return { chunks };
}

export function webPrompt(cfg, sections) {
  const plan = songPlan(cfg, sections);
  const out = [`Song style: ${(cfg.beat ?? []).join(', ')}.`, `Length: about ${Math.round(plan.chunks.reduce((s, c) => s + c.durationMs, 0) / 1000)} seconds.`, ''];
  sections.forEach((s, i) => {
    const c = s.who === 'Both' ? cfg.both ?? {} : cfg.characters[s.who];
    // Singers are "Rapper 1" / "Rapper 2", never their names: music services refuse prompts that name real people as singers.
    const who = s.who === 'Both' ? 'both rappers' : `Rapper ${Object.keys(cfg.characters).indexOf(s.who) + 1}`;
    out.push(`${plan.chunks[i].text.split('\n')[0]} (${who}): ${(c.voice ?? []).join(', ')}${c.avoid?.length ? `. Not: ${c.avoid.join(', ')}` : ''}.`);
    out.push(...s.lines, '');
  });
  return out.join('\n');
}

// ---------- timing ----------
export const norm = w => w.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
export const tokens = text => text.split(/[\s\-–—]+/).map(norm).filter(Boolean);

const srtTime = s => { const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
// Timed words from ElevenLabs speech-to-text JSON ({ words: [{text, start, end, type}] }), a plain [{text, start, end}] list,
// or an .srt file (each cue's time is spread evenly over its words).
export function readWords(text, file = '') {
  if (/\.srt$/i.test(file) || /-->/.test(text.slice(0, 500))) {
    const out = [];
    for (const block of text.split(/\r?\n\s*\r?\n/)) {
      const m = block.match(/(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)\s*\r?\n([\s\S]+)/);
      if (!m) continue;
      const a = srtTime(m[1]), b = srtTime(m[2]), ws = m[3].replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
      ws.forEach((w, i) => out.push({ text: w, start: a + (b - a) * i / ws.length, end: a + (b - a) * (i + 1) / ws.length }));
    }
    return out;
  }
  const j = JSON.parse(text);
  return (Array.isArray(j) ? j : j.words ?? []).filter(w => !w.type || w.type === 'word').map(w => ({ text: w.text.trim(), start: +w.start, end: +w.end }));
}

// Match every lyric word to the transcript (longest common subsequence), then give each line the time of its first and last matched word.
// Songs are transcribed imperfectly, so lines with no match at all get a time between their neighbours.
export function alignLines(sections, words, end) {
  const lyr = [];
  sections.forEach(s => s.lines.forEach(text => lyr.push({ who: s.who, text, toks: tokens(text) })));
  const L = lyr.flatMap((l, li) => l.toks.map(t => ({ t, li })));
  const S = words.flatMap(w => tokens(w.text).map(t => ({ t, w })));
  const n = L.length, m = S.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = L[i].t === S[j].t ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hits = lyr.map(() => []);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (L[i].t === S[j].t) { hits[L[i].li].push(S[j].w); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const lines = lyr.map((l, i) => ({ who: l.who, text: l.text, t0: hits[i][0]?.start ?? null, t1: hits[i].at(-1)?.end ?? null, matched: `${hits[i].length}/${l.toks.length}` }));
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t0 != null) continue;
    const prev = lines.slice(0, i).reverse().find(x => x.t1 != null), next = lines.slice(i + 1).find(x => x.t0 != null);
    const a = prev?.t1 ?? 0, b = next?.t0 ?? end ?? a + 3;
    lines[i].t0 = +(a + 0.05).toFixed(2); lines[i].t1 = +Math.max(a + 0.1, b - 0.05).toFixed(2); lines[i].guessed = true;
  }
  return lines;
}

// Before there is a song: spread each section's lines evenly over its planned length (for a preview only).
export function linesFromPlan(cfg, sections) {
  const plan = songPlan(cfg, sections), out = [];
  let t = cfg.introSeconds ?? 0;
  sections.forEach((s, i) => {
    const d = plan.chunks[i].durationMs / 1000, per = d / s.lines.length;
    s.lines.forEach((text, k) => out.push({ who: s.who, text, t0: +(t + k * per).toFixed(2), t1: +(t + (k + 1) * per - 0.1).toFixed(2), guessed: true }));
    t += d;
  });
  return out;
}

// After the real song: move every shot and card from the planned line times to the sung ones.
// Each planned line start is pinned to its real start, and times in between stretch to fit.
export function retime({ cfg, shots }, planned, real, end) {
  const pts = [[0, 0]];
  planned.forEach((l, i) => { if (real[i] && l.t0 > pts.at(-1)[0] && real[i].t0 > pts.at(-1)[1]) pts.push([l.t0, real[i].t0]); });
  const plannedEnd = cfg.end ?? planned.at(-1).t1;
  if (plannedEnd > pts.at(-1)[0] && end > pts.at(-1)[1]) pts.push([plannedEnd, end]);
  const map = t => {
    if (t >= plannedEnd - 0.001) return +end.toFixed(2);
    let i = 1; while (i < pts.length - 1 && pts[i][0] < t) i++;
    const [a, b] = [pts[i - 1], pts[i]];
    return +(a[1] + (t - a[0]) * (b[1] - a[1]) / (b[0] - a[0])).toFixed(2);
  };
  const moved = shots.map(s => {
    const o = { ...s, t0: map(s.t0), t1: map(s.t1) };
    for (const k of ['a0', 'a1']) if (s[k] != null) o[k] = map(s[k]);
    return o;
  });
  const cards = (cfg.cards ?? []).map(c => ({ ...c, t0: map(c.t0), t1: map(c.t1) }));
  return { shots: moved, cards, end: +end.toFixed(2) };
}

export const NEW_PROJECT = {
  'project.json': JSON.stringify({
    name: 'my-battle', end: 60, song: 'song.mp3', lyrics: 'lyrics.md',
    beat: ['hard trap drums', 'booming 808 bass', 'clear English diction'],
    characters: {
      'Character One': { color: '#ff3fa4', sheet: 'cast/one.png', look: 'Character sheet, front view and three-quarter view, of ... (fictional, not resembling any real person). Plain grey background.', voice: ['solo young rapper with a high, bright voice', 'fast flow'], avoid: ['deep voice'], sectionSeconds: 12, performs: 'Raps to the camera with attitude, head moving to the beat, blinking naturally.' },
      'Character Two': { color: '#2fd6c8', sheet: 'cast/two.png', look: 'Character sheet, front view and three-quarter view, of ... (fictional, not resembling any real person). Plain grey background.', voice: ['solo older rapper with a deep, low voice', 'slow, heavy flow'], avoid: ['high voice', 'fast flow'], sectionSeconds: 12, performs: 'Raps to the camera slowly and smugly, small head nods to the beat, blinking naturally.' },
    },
    both: { color: '#FFC531', voice: ['big unison chant', 'both rappers together'], sectionSeconds: 12 },
    frameStyle: 'Vertical 9:16 photorealistic cinematic music-video frame, everyone is an adult. No text, no letters, no logos, no watermark.',
    cards: [],
  }, null, 1),
  'lyrics.md': '# My battle\n\n[Character One]\nline 1\nline 2\nline 3\nline 4\n\n[Character Two]\nline 1\nline 2\nline 3\nline 4\n\n[Character One]\nline 1\nline 2\nline 3\nline 4\n\n[Character Two]\nline 1\nline 2\nline 3\nline 4\n\n[Both]\nline 1\nline 2\nline 3\nline 4\n',
  'shots.json': JSON.stringify({ shots: [] }, null, 1),
  'idea.md': '# The battle in 3 lines\n\n- Who: \n- What they fight about: \n- How it ends: \n\nDecisions:\n- \n',
  'facts.md': '# Facts used in the lyrics and cards\n\nOne line per fact, with where it comes from. This list goes in the video description.\n\n- \n',
};

// ---------- shots ----------
export const TYPES = ['lipsync', 'motion', 'still'];
// The slice of the song a lip-sync clip is driven by: the shot plus a little on each side, at least 2 seconds (the lip-sync minimum).
export function audioWindow(s) {
  let a0 = s.a0 ?? Math.max(0, s.t0 - 0.1), a1 = s.a1 ?? s.t1 + 0.1;
  if (a1 - a0 < LIPSYNC_SECONDS[0]) a1 = a0 + LIPSYNC_SECONDS[0];
  return [+a0.toFixed(2), +a1.toFixed(2)];
}
// Clip length to ask for: the shot plus the 0.2 s skipped at the start of each motion clip, rounded up.
export const motionSeconds = s => s.seconds ?? Math.max(2, Math.ceil(s.t1 - s.t0 + (s.in ?? 0.2) - 0.001));

const findFile = (dir, sub, id, exts) => exts.map(e => path.join(dir, sub, id + e)).find(f => fs.existsSync(f));
export const frameFile = (p, s) => s.image ? (fs.existsSync(path.join(p.dir, s.image)) ? path.join(p.dir, s.image) : undefined) : findFile(p.dir, 'frames', s.id, ['.png', '.jpg', '.jpeg', '.webp']);
export const clipFile = (p, s) => findFile(p.dir, 'clips', s.id, ['.mp4', '.mov']);

// Problems with the shot list as plain sentences. final: every picture and clip must exist.
export function shotProblems(p, { songSeconds, final = false } = {}) {
  const { shots, cfg } = p, end = cfg.end, out = [];
  if (!(end > 0)) out.push('project.json needs "end": the video length in seconds');
  if (!shots.length) return [...out, 'shots.json has no shots'];
  const ids = new Set();
  let t = 0;
  for (const s of shots) {
    const tag = `shot ${s.id}`;
    if (!s.id) out.push('a shot has no id');
    if (ids.has(s.id)) out.push(`${tag}: id used twice`); ids.add(s.id);
    if (!TYPES.includes(s.type)) out.push(`${tag}: type must be ${TYPES.join(', ')} (got ${s.type})`);
    if (!(s.t1 > s.t0)) out.push(`${tag}: t1 must be after t0`);
    if (Math.abs(s.t0 - t) > 0.02) out.push(`${tag}: starts at ${s.t0} but the shot before ends at ${t} (${s.t0 > t ? 'gap' : 'overlap'})`);
    t = s.t1;
    if (s.type === 'lipsync') {
      if (s.who && s.who !== 'Both' && !cfg.characters?.[s.who]) out.push(`${tag}: who "${s.who}" is not in project.json characters`);
      const [a0, a1] = audioWindow(s);
      if (a1 - a0 > LIPSYNC_SECONDS[1]) out.push(`${tag}: lip-sync audio is ${(a1 - a0).toFixed(1)} s, the limit is 60 s`);
      if (a0 > s.t0 + 0.1) out.push(`${tag}: audio starts (a0 ${a0}) after the shot starts (t0 ${s.t0}); the mouth would be out of sync`);
      if (a1 < s.t1 - 0.1) out.push(`${tag}: audio ends (a1 ${a1}) before the shot ends (t1 ${s.t1})`);
      if (songSeconds && a1 > songSeconds + 0.05) out.push(`${tag}: audio ends at ${a1} s but the song is only ${songSeconds.toFixed(1)} s`);
    }
    if (s.type === 'motion' && motionSeconds(s) + 0.01 < s.t1 - s.t0 + (s.in ?? 0.2)) out.push(`${tag}: clip is ${motionSeconds(s)} s but the shot needs ${(s.t1 - s.t0 + (s.in ?? 0.2)).toFixed(1)} s (set "seconds")`);
    if (!s.image && !s.frame) out.push(`${tag}: needs "frame" (the prompt for its ${s.type === 'still' ? '' : 'first '}picture) or "image"`);
    if (s.type === 'motion' && !s.motion) out.push(`${tag}: motion shots need "motion" (what moves)`);
    for (const r of s.refs ?? []) if (!cfg.characters?.[r]) out.push(`${tag}: refs "${r}" is not in project.json characters`);
    if (final) {
      if (s.type === 'still' && !frameFile(p, s)) out.push(`${tag}: missing picture (${s.image ?? `frames/${s.id}.png`})`);
      if (s.type !== 'still' && !clipFile(p, s)) out.push(`${tag}: missing clip (clips/${s.id}.mp4)`);
    }
  }
  if (end > 0 && Math.abs(t - end) > 0.02) out.push(`the last shot ends at ${t} but "end" is ${end}`);
  for (const c of cfg.cards ?? []) if (!(c.t1 > c.t0) || c.t0 < 0 || c.t1 > end + 0.01) out.push(`card "${c.text}": times must be inside 0–${end}`);
  return out;
}

export function estimate(p) {
  let lip = 0, mot = 0, img = 0;
  for (const s of p.shots) {
    if (s.type === 'lipsync') { const [a0, a1] = audioWindow(s); lip += Math.ceil(a1 - a0); }
    if (s.type === 'motion') mot += motionSeconds(s);
    if (s.frame && !s.image) img++;
  }
  img += Object.values(p.cfg.characters ?? {}).filter(c => c.look).length;
  const usd = lip * PRICES.lipsyncPerSecond + mot * PRICES.motionPerSecond + img * PRICES.image;
  return { lipsyncSeconds: lip, motionSeconds: mot, images: img, usd: +usd.toFixed(2) };
}

export function todoMarkdown(p) {
  const { cfg } = p, e = estimate(p), style = cfg.frameStyle ? ' ' + cfg.frameStyle : '';
  const out = [`# To make: ${p.name}`, '', `About USD ${e.usd.toFixed(2)} at the list prices in SKILL.md (lip-sync ${e.lipsyncSeconds} s, motion ${e.motionSeconds} s, ${e.images} pictures). Redos cost extra.`, '',
    '## 1. Character sheets (make these first, every shot uses them)', ''];
  for (const [name, c] of Object.entries(cfg.characters ?? {})) out.push(`- [${c.sheet && fs.existsSync(path.join(p.dir, c.sheet)) ? 'x' : ' '}] **${name}** → \`${c.sheet ?? `cast/${name.toLowerCase()}.png`}\`: ${c.look ?? '(no "look" in project.json)'}`);
  out.push('', '## 2. First pictures (9:16), one per shot', '');
  for (const s of p.shots) {
    if (s.image) continue;
    const refs = (s.refs ?? (s.who && s.who !== 'Both' ? [s.who] : [])).map(r => cfg.characters[r]?.sheet ?? r);
    out.push(`- [${frameFile(p, s) ? 'x' : ' '}] \`frames/${s.id}.png\`${refs.length ? ` (upload: ${refs.join(', ')})` : ''}: ${s.frame}${style}`);
  }
  out.push('', '## 3. Clips', '');
  for (const s of p.shots) {
    if (s.type === 'still') continue;
    const done = clipFile(p, s) ? 'x' : ' ';
    if (s.type === 'lipsync') {
      const [a0, a1] = audioWindow(s);
      out.push(`- [${done}] \`clips/${s.id}.mp4\` LIP-SYNC: picture \`frames/${s.id}.png\` + audio \`audio/${s.id}.mp3\` (song ${a0}–${a1} s). Prompt: ${s.prompt ?? cfg.characters[s.who]?.performs ?? 'raps to the camera with attitude, head moving to the beat, blinking naturally.'}`);
    } else out.push(`- [${done}] \`clips/${s.id}.mp4\` MOTION ${motionSeconds(s)} s from \`frames/${s.id}.png\`: ${s.motion}`);
  }
  return out.join('\n') + '\n';
}

// ---------- captions and cards ----------
export const CSS = `html,body{margin:0;width:${W}px;height:${H}px;background:transparent;font-family:"Arial Black","Helvetica Neue",Arial,sans-serif;color:#fff;overflow:hidden}
.cap{position:absolute;left:60px;right:140px;top:1200px;background:rgba(0,0,0,.55);border:5px solid #fff;border-radius:18px;padding:12px 18px 16px;text-align:center;font-size:54px;line-height:1.15;font-weight:900;-webkit-text-stroke:3px #000;paint-order:stroke fill;text-shadow:0 4px 18px rgba(0,0,0,.85)}
.cap.long{font-size:46px}
.cap .who{display:block;font-size:36px;letter-spacing:3px;-webkit-text-stroke:0;margin-bottom:4px}
.title{position:absolute;left:0;right:0;top:230px;text-align:center;font-size:104px;line-height:1;text-shadow:0 6px 24px rgba(0,0,0,.9);-webkit-text-stroke:3px #000;paint-order:stroke fill}
.title span{display:block}.title i{display:block;font-size:64px;color:#FFC531;font-style:normal;margin:10px 0}
.card{position:absolute;left:60px;right:150px;top:420px;text-align:center;background:rgba(10,10,10,.72);border:4px solid #FFC531;border-radius:18px;padding:18px;font-size:56px;line-height:1.2}
.card small{display:block;font-size:36px;color:#FFC531;margin-top:8px}
.ph{position:absolute;inset:0;background:#1b1e26;color:#cfd3dc;font:600 40px system-ui,sans-serif;padding:640px 80px 0;box-sizing:border-box}
.ph b{display:block;font-size:90px;color:#FFC531;margin-bottom:30px}`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// What the overlay shows at time t: the title (first seconds), cards from project.json, and the lyric line being sung.
// The singer's name sits inside the caption box, in their color, so it stays right even when the picture cuts away to someone else.
// Long lines get a smaller font so captions stay at two lines, clear of the area phone apps cover (below 80% of the height).
export function overlayHtml(t, { lines, cfg }) {
  const end = cfg.end, chars = cfg.characters ?? {}, titleUntil = cfg.titleSeconds ?? 3.6;
  const color = who => who === 'Both' ? cfg.both?.color ?? '#FFC531' : chars[who]?.color ?? '#ffffff';
  let h = '';
  if (t < titleUntil) {
    const names = Object.keys(chars);
    h += `<div class=title>${names.map((n, i) => `${i ? '<i>vs</i>' : ''}<span style="color:${color(n)}">${esc(n.toUpperCase())}</span>`).join('')}</div>`;
  }
  for (const c of cfg.cards ?? []) if (t >= c.t0 && t < c.t1) h += `<div class=card>${esc(c.text)}${c.note ? `<small>${esc(c.note)}</small>` : ''}</div>`;
  const i = lines.findIndex(l => t >= l.t0 - 0.05 && t < Math.min(lines[lines.indexOf(l) + 1]?.t0 ?? end, l.t1 + 0.6));
  if (i >= 0) {
    const L = lines[i], label = L.who === 'Both' ? Object.keys(chars).map(n => n.toUpperCase()).join(' × ') : L.who.toUpperCase();
    h += `<div class="cap${L.text.length > 40 ? ' long' : ''}" style="border-color:${color(L.who)}"><span class=who style="color:${color(L.who)}">${esc(label)}</span>${esc(L.text)}</div>`;
  }
  return h;
}
// The times where the overlay can change; between two of them it stays the same picture.
export function overlayBreaks({ lines, cfg }) {
  const end = cfg.end, B = new Set([0, end, cfg.titleSeconds ?? 3.6]);
  lines.forEach((l, i) => { B.add(+(l.t0 - 0.05).toFixed(2)); B.add(+Math.min(lines[i + 1]?.t0 ?? end, l.t1 + 0.6).toFixed(3)); B.add(+(lines[i + 1]?.t0 - 0.05).toFixed(2)); });
  for (const c of cfg.cards ?? []) { B.add(c.t0); B.add(c.t1); }
  return [...B].filter(t => Number.isFinite(t) && t >= 0 && t <= end).sort((a, b) => a - b);
}

async function makeOverlay(p, lines, puppeteer, ff) {
  const dir = path.join(p.dir, 'build', 'ov');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const bs = overlayBreaks({ lines, cfg: p.cfg });
  const browser = await puppeteer.launch(launchOpts());
  let list = '', n = 0, prev = null;
  try {
    const page = await browser.newPage(); await page.setViewport({ width: W, height: H });
    for (let i = 0; i < bs.length - 1; i++) {
      const d = bs[i + 1] - bs[i]; if (d < 0.01) continue;
      const h = overlayHtml((bs[i] + bs[i + 1]) / 2, { lines, cfg: p.cfg });
      if (h !== prev) { await page.setContent(`<style>${CSS}</style>${h}`); await page.screenshot({ path: path.join(dir, `${String(n++).padStart(3, '0')}.png`), omitBackground: true }); }
      prev = h; list += `file '${String(n - 1).padStart(3, '0')}.png'\nduration ${d.toFixed(3)}\n`;
    }
  } finally { await browser.close(); }
  list += `file '${String(n - 1).padStart(3, '0')}.png'\n`;
  fs.writeFileSync(path.join(dir, 'list.txt'), list);
  const out = path.join(p.dir, 'build', 'overlay.mov');
  execFileSync(ff, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', `fps=${FPS},format=rgba`, '-c:v', 'png', '-t', String(p.cfg.end), out]);
  return out;
}

// A stand-in card for a shot that has no picture yet (preview only): its id, type and prompts.
async function placeholder(p, s, browser) {
  const f = path.join(p.dir, 'build', 'ph', s.id + '.png');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const page = await browser.newPage(); await page.setViewport({ width: W, height: H });
  await page.setContent(`<style>${CSS}</style><div class=ph><b>${esc(s.id)} · ${esc(s.type)}</b>${esc(s.frame ?? (s.image ? `reuses ${s.image}` : ''))}<br><br>${esc(s.motion ?? '')}</div>`);
  await page.screenshot({ path: f }); await page.close();
  return f;
}

export function songSeconds(file, ff = findFfmpeg()) {
  const r = spawnSync(ff, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

const songFile = p => path.join(p.dir, p.cfg.song || 'song.mp3');
const linesFile = p => path.join(p.dir, 'lines.json');

export async function cut(p, { preview = false, puppeteer = loadPuppeteer(), ff = findFfmpeg(), log = console.log } = {}) {
  const problems = shotProblems(p, { final: !preview });
  if (problems.length) throw new Error('fix these first (node battle.mjs check):\n- ' + problems.join('\n- '));
  let lines, estimated = false;
  if (fs.existsSync(linesFile(p))) lines = JSON.parse(fs.readFileSync(linesFile(p), 'utf8'));
  else if (preview) { lines = linesFromPlan(p.cfg, p.sections); estimated = true; }
  else throw new Error('lines.json is missing: run "node battle.mjs lines <project>" first');
  const seg = path.join(p.dir, 'build', 'seg'); fs.mkdirSync(seg, { recursive: true });
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}`;
  const files = [];
  let filled = 0, cards = 0, browser = null;
  try {
  for (const s of p.shots) {
    const d = +(s.t1 - s.t0).toFixed(3), out = path.join(seg, s.id + '.mp4'), clip = s.type === 'still' ? null : clipFile(p, s);
    if (clip) {
      const from = s.type === 'lipsync' ? Math.max(0, +(s.t0 - audioWindow(s)[0]).toFixed(3)) : (s.in ?? 0.2);
      execFileSync(ff, ['-v', 'error', '-y', '-ss', String(from), '-i', clip, '-t', String(d), '-vf', `${fit},tpad=stop_mode=clone:stop_duration=${d}`, '-t', String(d), '-an', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', out]);
    } else {
      let still = frameFile(p, s);
      if (!still) { still = await placeholder(p, s, browser ??= await puppeteer.launch(launchOpts())); cards++; }
      else if (s.type !== 'still') filled++;
      const n = Math.round(d * FPS);
      execFileSync(ff, ['-v', 'error', '-y', '-loop', '1', '-i', still, '-t', String(d), '-vf',
        `scale=${W * 1.2}:-2,zoompan=z='1.0+0.08*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${H}:fps=${FPS},setsar=1`,
        '-an', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', out]);
    }
    files.push(out);
  }
  } finally { await browser?.close(); }
  fs.writeFileSync(path.join(seg, 'list.txt'), files.map(f => `file '${path.basename(f)}'`).join('\n'));
  const video = path.join(p.dir, 'build', 'video-only.mp4');
  execFileSync(ff, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(seg, 'list.txt'), '-c', 'copy', video]);
  const overlay = await makeOverlay(p, lines, puppeteer, ff);
  const end = p.cfg.end, song = songFile(p), hasSong = fs.existsSync(song);
  if (!hasSong && !preview) throw new Error(`song not found: ${p.cfg.song || 'song.mp3'}`);
  const final = path.join(p.dir, 'build', `${p.name}${preview ? '-preview' : ''}.mp4`);
  const audioIn = hasSong ? ['-i', song] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  execFileSync(ff, ['-v', 'error', '-y', '-i', video, '-i', overlay, ...audioIn,
    '-filter_complex', `[0:v][1:v]overlay=0:0:shortest=1,format=yuv420p[v];[2:a]atrim=0:${end},afade=t=out:st=${Math.max(0, end - 0.6)}:d=0.6,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
    '-map', '[v]', '-map', '[a]', '-t', String(end), '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-movflags', '+faststart', final]);
  // The pieces take about 200 MB; only the finished video is kept.
  for (const x of ['seg', 'ov', 'ph', 'video-only.mp4', 'overlay.mov']) fs.rmSync(path.join(p.dir, 'build', x), { recursive: true, force: true });
  return { out: final, filled, cards, song: hasSong, estimated };
}

// ---------- command line ----------
async function main(argv) {
  const [cmd, dir = '.'] = argv;
  const flag = f => argv.includes(f);
  if (!cmd || !['new', 'plan', 'lines', 'retime', 'todo', 'segments', 'check', 'cut'].includes(cmd)) {
    console.error('usage: node battle.mjs <new|plan|lines|retime|todo|segments|check|cut> <project folder>\n  check --final   every picture and clip must exist\n  cut --preview   cards or stills where clips are missing\n  retime --end <seconds>   video length when there is no song file; --again to retime twice'); return 2;
  }
  if (cmd === 'new') {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) { console.error(`${dir} already exists and is not empty`); return 1; }
    fs.mkdirSync(dir, { recursive: true });
    for (const [f, text] of Object.entries(NEW_PROJECT)) fs.writeFileSync(path.join(dir, f), f === 'project.json' ? text.replace('"my-battle"', JSON.stringify(path.basename(path.resolve(dir)))) : text);
    console.log(`made ${dir}: idea.md, project.json, lyrics.md, shots.json, facts.md. Fill in the characters and lyrics, then run plan.`);
    return 0;
  }
  if (!fs.existsSync(path.join(dir, 'project.json'))) { console.error(`no project.json in ${dir}`); return 2; }
  const p = loadProject(dir);
  if (cmd === 'plan') {
    fs.writeFileSync(path.join(dir, 'song-plan.json'), JSON.stringify(songPlan(p.cfg, p.sections), null, 1));
    fs.writeFileSync(path.join(dir, 'song-prompt.txt'), webPrompt(p.cfg, p.sections));
    const est = linesFromPlan(p.cfg, p.sections), total = songPlan(p.cfg, p.sections).chunks.reduce((s, c) => s + c.durationMs, 0) / 1000;
    for (const l of est) console.log(`${l.t0.toFixed(2).padStart(6)}–${l.t1.toFixed(2).padEnd(6)} ${l.who}: ${l.text}`);
    console.log(`\nwrote song-plan.json (${p.sections.length} sections, ${total} s) and song-prompt.txt. The times above are estimates for planning shots before the song exists${p.cfg.end !== total ? `; set "end" in project.json to ${total} until then` : ''}.`);
  } else if (cmd === 'lines') {
    const wf = ['words.json', 'words.srt'].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
    if (!wf) { console.error('need words.json (ElevenLabs speech-to-text) or words.srt (any captions file) of the song in the project folder'); return 1; }
    const lines = alignLines(p.sections, readWords(fs.readFileSync(wf, 'utf8'), wf), p.cfg.end);
    fs.writeFileSync(linesFile(p), JSON.stringify(lines, null, 1));
    console.log('  start–end    words heard  line');
    for (const l of lines) console.log(`${l.t0.toFixed(2).padStart(6)}–${l.t1.toFixed(2).padEnd(6)} ${l.guessed ? 'GUESS ' : l.matched.padEnd(6)} ${l.who}: ${l.text}`);
    const guessed = lines.filter(l => l.guessed).length;
    console.log(`\nwrote lines.json (${lines.length} lines${guessed ? `, ${guessed} guessed: check them by ear and fix the times in lines.json` : ''})`);
  } else if (cmd === 'retime') {
    if (!fs.existsSync(linesFile(p))) { console.error('run lines first: retime moves shots from the planned line times to the real ones in lines.json'); return 1; }
    const backup = path.join(dir, 'shots.before-retime.json');
    if (fs.existsSync(backup) && !flag('--again')) { console.error('already retimed once (shots.before-retime.json exists). Add --again to retime the current shots anyway.'); return 1; }
    const ei = argv.indexOf('--end'), song = songFile(p);
    const secs = ei >= 0 ? Number(argv[ei + 1]) : fs.existsSync(song) ? songSeconds(song) : null;
    if (!(secs > 0)) {
      const last = JSON.parse(fs.readFileSync(linesFile(p), 'utf8')).at(-1).t1;
      console.error(`the song is needed to know the new length, or give it: --end ${(Math.ceil((last + 0.5) * 10) / 10).toFixed(1)} (the last line ends at ${last.toFixed(2)} s)`); return 1;
    }
    const r = retime(p, linesFromPlan(p.cfg, p.sections), JSON.parse(fs.readFileSync(linesFile(p), 'utf8')), ei >= 0 ? secs : Math.floor(secs * 10) / 10);
    fs.copyFileSync(path.join(dir, 'shots.json'), backup);
    fs.copyFileSync(path.join(dir, 'project.json'), path.join(dir, 'project.before-retime.json'));
    fs.writeFileSync(path.join(dir, 'shots.json'), JSON.stringify({ shots: r.shots }, null, 1));
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ ...p.cfg, end: r.end, cards: r.cards }, null, 1));
    console.log(`moved ${r.shots.length} shots and ${r.cards.length} cards to the real line times; "end" is now ${r.end} s. Old versions: shots.before-retime.json, project.before-retime.json. Run check, then preview.`);
  } else if (cmd === 'todo') {
    fs.writeFileSync(path.join(dir, 'todo.md'), todoMarkdown(p));
    const e = estimate(p);
    console.log(`wrote todo.md (about USD ${e.usd.toFixed(2)}: lip-sync ${e.lipsyncSeconds} s, motion ${e.motionSeconds} s, ${e.images} pictures)`);
  } else if (cmd === 'segments') {
    const song = songFile(p);
    if (!fs.existsSync(song)) { console.error(`song not found: ${path.relative('.', song)}`); return 1; }
    fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
    for (const s of p.shots.filter(s => s.type === 'lipsync')) {
      const [a0, a1] = audioWindow(s), out = path.join(dir, 'audio', s.id + '.mp3');
      execFileSync(findFfmpeg(), ['-v', 'error', '-y', '-ss', String(a0), '-t', String(+(a1 - a0).toFixed(2)), '-i', song, '-c:a', 'libmp3lame', '-b:a', '192k', out]);
      console.log(`audio/${s.id}.mp3  ${a0}–${a1} s`);
    }
  } else if (cmd === 'check') {
    const song = songFile(p), secs = fs.existsSync(song) ? songSeconds(song) : null;
    const problems = shotProblems(p, { songSeconds: secs, final: flag('--final') });
    try { songPlan(p.cfg, p.sections); } catch (e) { problems.unshift(e.message); }
    const missing = { frames: p.shots.filter(s => s.type !== 'still' || !s.image).filter(s => !frameFile(p, s)).length, clips: p.shots.filter(s => s.type !== 'still' && !clipFile(p, s)).length };
    console.log(`${p.sections.length} lyric sections, ${p.shots.length} shots, ${p.cfg.end} s; song ${secs ? secs.toFixed(1) + ' s' : 'not made yet'}; lines.json ${fs.existsSync(linesFile(p)) ? 'ok' : 'not made yet'}; still to make: ${missing.frames} pictures, ${missing.clips} clips`);
    const facts = fs.existsSync(path.join(dir, 'facts.md')) ? fs.readFileSync(path.join(dir, 'facts.md'), 'utf8') : '';
    if (!/^- \S/m.test(facts)) console.log('NOTE  facts.md lists no facts: add every fact in the lyrics and cards with its source (it goes in the video description)');
    for (const c of p.cfg.cards ?? []) if (c.text.length > 28 || (c.note ?? '').length > 40) console.log(`NOTE  card "${c.text}" is long and may cover the picture: aim for text up to 28 characters and note up to 40`);
    for (const x of problems) console.log('FAIL  ' + x);
    console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall checks passed');
    return problems.length ? 1 : 0;
  } else if (cmd === 'cut') {
    const r = await cut(p, { preview: flag('--preview') });
    console.log(`wrote ${path.relative('.', r.out)}${r.cards ? ` (${r.cards} shots shown as cards: no picture yet)` : ''}${r.filled ? ` (${r.filled} shots shown as their still picture: no clip yet)` : ''}${r.song ? '' : ' (silent: no song yet)'}${r.estimated ? ' (caption times estimated from the song plan: run lines once the song exists)' : ''}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (e) { console.error(String(e.message || e)); process.exitCode = 1; }
}
