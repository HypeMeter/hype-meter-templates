// Offline tests: node test.mjs
import { check, format, RULES, MODES } from './plain.mjs';
import { main, parseArgs } from './check.mjs';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name); }
  catch (e) { fail++; console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 3).join('\n       ')); }
}
const eq = (a, b, m = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${m} expected ${B}, got ${A}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const ids = (text, mode) => check(text, { mode }).hits.map(h => h.id);
const has = (text, id, mode = 'prose') => ok(ids(text, mode).includes(id), `expected ${id} in "${text}" (${mode}); got ${ids(text, mode)}`);
const lacks = (text, id, mode = 'prose') => ok(!ids(text, mode).includes(id), `did not expect ${id} in "${text}" (${mode})`);

console.log('plain.mjs');

await test('not X but Y, all forms', () => {
  has("It's not just a nap, it's a lifestyle.", 'not-x-but-y');
  has('This is not a bug. It is a feature.', 'not-x-but-y');
  has("Your knee isn't a joint. It's a smoke alarm.", 'not-x-but-y');
  has("The question isn't whether AI is smart.", 'not-x-but-y');
  has('Not only cheaper but faster.', 'not-x-but-y');
});
await test('plain negation is fine', () => {
  lacks("It's not raining.", 'not-x-but-y');
  lacks('No exception. The bride and groom toast with juice.', 'negative-list', 'script');
});
await test('negative list and staged openers', () => {
  has('No nostalgia. No taste. No mercy.', 'negative-list');
  has("Here's the thing: nobody reads docs.", 'staged-opener');
  has('Fun fact: owls have no eyeballs.', 'staged-opener', 'script');
  has("Let's dive into caching.", 'staged-opener');
});
await test('email filler, reveal questions, uncontracted openers', () => {
  has('I hope this email finds you well.', 'email-filler');
  has('Moving forward, we ship on Fridays.', 'email-filler');
  has('Just checking in on the invoice.', 'email-filler');
  lacks('We moved forward with the plan.', 'email-filler');
  has('The result? It worked.', 'reveal-question', 'post');
  lacks('The result? It worked.', 'reveal-question', 'script');
  has('Here is the thing: no.', 'staged-opener');
  eq(check('It was mind-blowing.').hits[0].sev, 2);
});
await test('spaced hyphen counts as a dash; list items and ranges do not', () => {
  has('Fast - and cheap.', 'dash');
  lacks('- a list item', 'dash');
  lacks('See pages 5 - 10.', 'dash');
  lacks('A well-known co-op.', 'dash');
});
await test('round 2: capitalized spaced emphasis, more-than-just reframe, new stock phrases', () => {
  has('Every. Single. Detail. Checked.', 'spaced-emphasis', 'post');
  has("This is more than just a phone. It's a lifestyle.", 'not-x-but-y');
  has('This game-changing tool empowers teams to unlock their full potential.', 'ai-word');
  has('In conclusion, the data speaks for itself.', 'deep-saying');
  has("Whether you're a beginner or a seasoned pro, there's something for everyone.", 'deep-saying');
  has("The future of work is here, and it's powered by AI.", 'inflation');
});
await test('round 2: normal lines are not FAIL or REVIEW from a single hit', () => {
  eq(check('Let me know if you have any questions about the invoice.').verdict, 'PASS');
  eq(check('The test is robust to outliers.').verdict, 'PASS');
  eq(check('My brother — the one in Ohio — called last night.').verdict, 'REVIEW');
  eq(check('The tapestry in grandma\'s hallway is from 1890.').verdict, 'PASS');
});
await test('closers and chatbot residue', () => {
  has('Let that sink in.', 'closer');
  has("That's the real win.", 'closer');
  has('Great question! It started in 1789.', 'chatbot');
  has('Hope this helps', 'chatbot');
  has('Let me know if you have any questions!', 'email-filler');
});
await test('dashes: em always, en only between words', () => {
  has('The policy — announced late — hurts.', 'dash');
  has('Fast -- and cheap.', 'dash');
  lacks('Shorts run 25–40 seconds.', 'dash');
  lacks('A well-known co-op.', 'dash');
});
await test('AI words with severity', () => {
  const r = check('We delve into a vibrant tapestry.', { mode: 'prose' });
  eq(r.hits.filter(h => h.id === 'ai-word').map(h => h.match.toLowerCase()), ['delve', 'vibrant', 'tapestry']);
  ok(r.hits.every(h => h.sev === 2));
  eq(check('A crucial step.').hits[0].sev, 1);
  lacks('He delivered the package.', 'ai-word');
});
await test('mode gating: triads, hashtags, spaced emphasis', () => {
  const t = 'A spouse, an apartment, and a juice box.';
  has(t, 'triad', 'post');
  lacks(t, 'triad', 'script');
  has('ship it #ai #tools #llm', 'hashtag-pile', 'post');
  lacks('ship it #ai #tools #llm', 'hashtag-pile', 'prose');
  has('I test it every. single. day.', 'spaced-emphasis', 'post');
  lacks('Did you know? No. Really.', 'spaced-emphasis', 'post');
});
await test('emoji pile only on X', () => {
  has('Big news 🚀🔥', 'emoji-pile', 'post');
  lacks('Big news 🚀', 'emoji-pile', 'post');
});
await test('skips code, URLs and voice-ok lines', () => {
  eq(ids('```\nLet that sink in — delve\n```', 'prose'), []);
  eq(ids('Run `delve --now` today.'), []);
  eq(ids('See https://x.com/a—b'), []);
  eq(ids("It's not a phase, it's a lifestyle. voice-ok"), []);
});
await test('line and column are right', () => {
  const h = check('Fine line.\nWe delve here.').hits[0];
  eq([h.line, h.col, h.match], [2, 4, 'delve']);
});
await test('verdicts', () => {
  eq(check('Owls cannot move their eyes, so they turn their heads.').verdict, 'PASS');
  eq(check('Let that sink in.').verdict, 'FAIL');
  eq(check('We delve into a vibrant, intricate tapestry of seamless journeys.').verdict, 'REVIEW');
});
await test('unknown mode throws; every rule has why/fix and valid modes', () => {
  let threw = false; try { check('x', { mode: 'poem' }); } catch { threw = true; }
  ok(threw);
  for (const r of RULES) { ok(r.why && r.fix, r.id); ok(r.re.flags.includes('g'), r.id + ' needs g'); (r.modes || []).forEach(m => ok(MODES.includes(m), r.id)); }
});
await test('ignore option drops a rule', () => {
  eq(check('A — B', { ignore: ['dash'] }).hits.length, 0);
});
await test('format output', () => {
  const s = format(check('Let that sink in.'), { file: 'a.md' });
  ok(s.startsWith('a.md: FAIL'), s);
  ok(s.includes('closer'), s);
});

console.log('check.mjs');
const run = async (argv, stdin = '') => { const out = []; const code = await main(argv, { stdout: s => out.push(s), readStdin: () => stdin }); return { code, out: out.join('\n') }; };
await test('parseArgs', () => eq(parseArgs(['a.md', '--mode', 'post', '--json']), { _: ['a.md'], mode: 'post', json: true }));
await test('check --text exit codes', async () => {
  eq((await run(['--text', 'Owls turn their heads.'])).code, 0);
  eq((await run(['--text', 'Let that sink in.'])).code, 1);
});
await test('stdin + json', async () => {
  const r = await run(['-', '--mode', 'post', '--json'], 'Big news 🚀🔥');
  eq(r.code, 0);
  eq(JSON.parse(r.out).hits[0].id, 'emoji-pile');
});
await test('bad mode and a file that does not exist are usage errors', async () => {
  eq((await run(['--text', 'hi', '--mode', 'poem'])).code, 2);
  eq((await run(['nope'])).code, 2);
});
await test('rules lists ids', async () => ok((await run(['--rules'])).out.includes('not-x-but-y')));
await test('old mode names still work: x = post, email = prose', async () => {
  has('ship it #ai #tools #llm', 'hashtag-pile', 'x');
  eq((await run(['--text', 'Big news 🚀🔥', '--mode', 'x', '--json'])).out.includes('emoji-pile'), true);
  eq(check('A — B', { mode: 'email' }).mode, 'prose');
});
await test('missing file is a clear usage error', async () => {
  const r = await run(['nope-not-here.md']); eq(r.code, 2); ok(r.out.includes('file not found'), r.out);
});
await test('no arguments prints help', async () => { const r = await run([]); eq(r.code, 2); ok(r.out.includes('Plain English checker')); });

await test('examples/before-after.md: every verdict it shows is what the checker says', async () => {
  const md = (await import('node:fs')).readFileSync(new URL('./examples/before-after.md', import.meta.url), 'utf8');
  let n = 0;
  for (const sec of md.split(/^## /m).slice(1)) {
    const mode = sec.match(/^[^\n]*\((script|post|prose)\)/)[1];
    for (const m of sec.matchAll(/\*\*(?:Before|After)\*\* \((PASS|REVIEW|FAIL)\)\n((?:>.*\n?)+)/g)) {
      const text = m[2].replace(/^> ?/gm, '');
      eq(check(text, { mode }).verdict, m[1], `${sec.split('\n')[0]}: "${text.slice(0, 40)}"`); n++;
    }
  }
  eq(n, 10, 'examples found');
});

await test('this skill\'s own README and SKILL.md pass the checker', async () => {
  const fs = await import('node:fs');
  for (const f of ['README.md', 'SKILL.md']) eq(check(fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8')).verdict, 'PASS', f);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
