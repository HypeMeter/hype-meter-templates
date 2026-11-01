#!/usr/bin/env node
// Check English text for AI-writing patterns. Free and offline; nothing to install.
//   node check.mjs draft.md [more files] [--mode script|post|prose] [--json] [--ignore dash,triad]
//   node check.mjs --text "One line to check" --mode post
//   pbpaste | node check.mjs - --mode post        (read pasted text)
//   node check.mjs --rules                          (list what it looks for)
// Exit code: 0 = PASS or REVIEW, 1 = FAIL (at least one strong pattern), 2 = usage error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, format, MODES, ALIASES, RULES } from './plain.mjs';

const HELP = `Plain English checker: finds patterns that make English read as AI-written. Free, offline.

  node check.mjs <file ...> [--mode script|post|prose] [--json] [--ignore dash,triad]
  node check.mjs --text "One line to check" [--mode post]
  node check.mjs - [--mode post]          read text you paste or pipe in
  node check.mjs --rules                  list what it looks for

modes: script = anything read aloud: video scripts, voice-overs, podcasts (short fragments and questions allowed)
       post   = social posts and replies: X, LinkedIn, Threads (also checks hashtag and emoji piles, lists of three)
       prose  = emails, descriptions, articles, READMEs (the default)
Put "voice-ok" anywhere on a line you wrote that way on purpose, and it is skipped.
Exit 0 = PASS or REVIEW, 1 = FAIL (at least one strong pattern), 2 = usage error.`;

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-' || !a.startsWith('-')) { out._.push(a); continue; }
    const k = a.replace(/^--?/, '');
    if (['json', 'help', 'h', 'rules'].includes(k)) out[k === 'h' ? 'help' : k] = true;
    else { out[k] = argv[i + 1]; i++; }
  }
  return out;
}

export async function main(argv, { stdout = console.log, readStdin = () => fs.readFileSync(0, 'utf8') } = {}) {
  const a = parseArgs(argv);
  if (a.help || (!a._.length && a.text == null && !a.rules)) { stdout(HELP); return a.help ? 0 : 2; }
  if (a.rules) {
    const seen = new Set();
    for (const r of RULES) {
      const k = `${r.id}/${r.sev}`; if (seen.has(k)) continue; seen.add(k);
      stdout(`${r.id.padEnd(15)} ${['', 'weak', 'medium', 'strong'][r.sev].padEnd(6)} ${(r.modes || ['all']).join(',').padEnd(10)} ${r.why}`);
    }
    return 0;
  }
  const mode = ALIASES[a.mode] ?? a.mode ?? 'prose';
  if (!MODES.includes(mode)) { stdout(`unknown --mode ${a.mode} (use ${MODES.join(', ')})`); return 2; }
  const ignore = a.ignore ? a.ignore.split(',') : [];
  let inputs;
  try {
    inputs = a.text != null ? [{ file: null, text: a.text }]
      : a._.map(f => ({ file: f === '-' ? null : f, text: f === '-' ? readStdin() : fs.readFileSync(f, 'utf8') }));
  } catch (e) { stdout(e.code === 'ENOENT' ? `file not found: ${e.path}` : e.message); return 2; }
  const results = inputs.map(({ file, text }) => ({ file, ...check(text, { mode, ignore }) }));
  if (a.json) stdout(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  else results.forEach(r => stdout(format(r, { file: r.file })));
  return results.some(r => r.verdict === 'FAIL') ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e.message); process.exit(2); });
}
