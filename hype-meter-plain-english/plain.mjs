// Finds the patterns that make English read as AI-written (scripts, social posts, emails, descriptions).
// Zero dependencies, no network, no cost. Patterns adapted from blader/humanizer v3.1.0 and hardikpandya/stop-slop
// (both MIT; see THIRD-PARTY-NOTICES.md). It flags; a person decides. Skip an intentional line with `voice-ok` anywhere on it.

export const MODES = ['script', 'post', 'prose'];
export const ALIASES = { x: 'post', tweet: 'post', social: 'post', email: 'prose' };
export const SEV = { 3: 'strong', 2: 'medium', 1: 'weak' };

// Lookarounds instead of \b so entries may end in punctuation ("certainly!", "fun fact:").
const words = list => new RegExp(`(?<![\\w'])(?:${list.join('|')})(?![\\w'])`, 'gi');

// sev 3 = act on one sighting; 2 = usually fix; 1 = only matters when several pile up.
// modes: where the rule runs (default: all). Comedy scripts use fragments, triads and questions on purpose.
export const RULES = [
  // A. Staging instead of stating
  { id: 'not-x-but-y', sev: 3, re: /\bnot (?:just|only|merely|simply)\b[^.!?\n]{1,80}?\bbut\b/gi,
    why: '"not just X but Y" adds weight, not information', fix: 'State Y directly.' },
  { id: 'not-x-but-y', sev: 3, re: /\b(?:it'?s|it is|this is|that'?s|that is|it was|this was)\s+not\b[^.!?\n]{1,60}?[,;.:—–]\s*(?:it'?s|it is|this is|that'?s|it was|they'?re)\b/gi,
    why: '"It\'s not X, it\'s Y" is the most common AI contrast', fix: 'State Y directly; keep a contrast only if someone really believes X.' },
  { id: 'not-x-but-y', sev: 3, re: /\b(?:isn'?t|wasn'?t|aren'?t|is not|was not)\s+(?:just\s+)?(?:a|an|the|about)\b[^.!?\n]{1,50}?[.;,—–]\s*(?:it'?s|it was|they'?re|that'?s|it is)\b/gi,
    why: '"X isn\'t A. It\'s B." reframe', fix: 'State B directly.' },
  { id: 'not-x-but-y', sev: 3, re: /\b(?:is|was|it'?s|this is)\s+more than (?:just )?(?:a|an|the)\b[^.!?\n]{1,50}?[.;,—–]\s*(?:it'?s|it is|it was)\b/gi,
    why: '"More than just X. It\'s Y." reframe', fix: 'State Y directly.' },
  { id: 'not-x-but-y', sev: 3, re: /\bthe (?:question|answer|problem|point|issue|secret) (?:isn'?t|is not|wasn'?t)\b/gi,
    why: '"The question isn\'t X" pivot', fix: 'Say what the question is.' },
  { id: 'not-because', sev: 2, re: /\bnot because\b[^.!?\n]{1,80}?[.,;]\s*(?:but\s+)?because\b/gi,
    why: '"Not because X. Because Y." telegraphed reversal', fix: 'Give the real reason once.' },
  { id: 'negative-list', sev: 3, re: /(?:\b(?:No|Not) [\w'-]+(?: [\w'-]+){0,2}[.!]\s*){2,}/g,
    why: 'Row of "No X. No Y." fragments', fix: 'One sentence with the specific claim.' },
  { id: 'staged-opener', sev: 3,
    re: words(["let'?s dive in", "let'?s dive into", "let'?s explore", "let'?s break (?:it|this|that) down", "here'?s the thing", "here'?s the kicker", "here'?s the catch",
      "here'?s what you need to know", "here'?s why (?:that|this|it) matters", "without further ado", "the truth is", "the reality is", "the uncomfortable truth",
      "here is the thing", "let me be clear", "make no mistake", "real talk", "buckle up", "picture this", "imagine a world", "in a world where", "ever wondered", "what if i told you",
      "you won'?t believe", "plot twist", "spoiler alert", "fun fact:", "but wait,? there'?s more"]),
    why: 'Announces the point instead of making it', fix: 'Cut the run-up; start with the fact.' },
  { id: 'deep-saying', sev: 2,
    re: words(['at its core', 'at the end of the day', 'what really matters', 'the real (?:question|problem|issue|answer|story|lesson) is', 'the heart of the matter',
      'when it comes to', "in today'?s (?:fast-paced |digital |modern )?(?:world|age|landscape)", "it'?s worth noting", 'it is worth noting', "it'?s important to (?:note|remember)",
      'more than (?:just )?a (?:tool|game|story|number)', 'is a (?:feature|superpower), not a bug', 'in conclusion', 'speaks for itself',
      "whether you'?re a (?:beginner|newbie|novice) or a (?:seasoned|experienced) (?:pro|professional|expert)", 'something for everyone']),
    why: 'Ordinary point dressed as a hidden truth', fix: 'Say the specific claim.' },
  { id: 'closer', sev: 3,
    re: words(['let that sink in', 'read that again', 'full stop', "that'?s the (?:real )?(?:win|point|lesson|magic|secret|kicker)", 'that distinction matters',
      'this changes everything', 'and that changes everything', "and that'?s okay", "and honestly\\?", 'mind\\. blown', 'think about that', 'let that be a lesson',
      'the lesson\\?', 'the takeaway\\?', 'the moral of the story']),
    why: 'Line asks the reader to pause instead of adding anything', fix: 'Cut it, or replace with a new fact.' },
  { id: 'reveal-question', sev: 2, re: /\b(?:the|my) (?:result|results|answer|verdict|catch|best part|twist|kicker|outcome)\?/gi, modes: ['post', 'prose'],
    why: '"The result? X." staged reveal', fix: 'Say the result in the sentence.' },
  { id: 'spaced-emphasis', sev: 3, re: /\b[a-z]+\. [a-z]+\. [a-z]+\.(?=\s|$)/gi, modes: ['post', 'prose'],
    why: '"every. single. day." emphasis', fix: 'Write the sentence normally.' },
  { id: 'arguing-no-one', sev: 2,
    re: words(["i'?m not saying", 'to be clear', "don'?t get me wrong", 'this is not to say', 'some might say', 'you might think', 'one might (?:argue|think)', 'a tempting approach']),
    why: 'Answers an objection nobody made', fix: 'Remove the defense.' },

  // B. Rhythm by rule
  { id: 'dash', sev: 2, re: /—|(?<=\D)\s?–\s?(?=\D)| -- |(?<=[A-Za-z,]) - (?=[A-Za-z])/g,
    why: 'Dashes everywhere are a model habit (and TTS reads them as odd pauses)', fix: 'Use a period, comma or colon.' },
  { id: 'triad', sev: 1, re: /\b\w+(?: \w+)?, \w+(?: \w+)?,? and \w+(?: \w+)?\b/g, modes: ['post', 'prose'],
    why: 'Lists of three by default', fix: 'Keep three only if there are really three; two often reads more human.' },
  { id: 'stacked-hedge', sev: 2, re: words(['could potentially', 'might potentially', 'may potentially', 'might arguably', 'could arguably', 'possibly could']),
    why: 'Stacked qualifiers', fix: 'One qualifier, or none.' },

  // C. Inflation and stock words
  { id: 'ai-word', sev: 2,
    re: words(['delve[sd]?', 'delving', 'tapestry', 'testament', 'pivotal', 'underscores?', 'underscored', 'showcas(?:e|es|ed|ing)', 'vibrant', 'intricate', 'intricacies',
      'meticulous(?:ly)?', 'seamless(?:ly)?', 'realm', 'embark(?:s|ed|ing)?', 'unleash(?:es|ed|ing)?', 'elevate[sd]?', 'harness(?:es|ed|ing)?', 'foster(?:s|ed|ing)?',
      'leverag(?:e|es|ed|ing)', 'game[- ]chang(?:er|ers|ing)', 'empower(?:s|ed|ing)?', 'unlock (?:your|their|its|our) (?:full )?potential', 'cutting[- ]edge', 'ever[- ]evolving', 'bustling', 'nestled', 'breathtaking', 'beacon', 'symphony of', 'labyrinth',
      'captivating', 'mesmerizing', 'enigma(?:tic)?', 'interplay', 'garner(?:s|ed)?', 'bolster(?:s|ed)?', 'unwavering', 'paradigm', 'synergy', 'holistic',
      'navigat(?:e|es|ing) the', 'landscape of', 'journey of', 'a deep dive', 'unlock(?:s|ed|ing)? the', 'mind[- ]blowing', 'mind[- ]bending']),
    why: 'Word models use far more than people do', fix: 'Use the plain word (use, show, help, start, big).' },
  { id: 'ai-word', sev: 1, re: words(['crucial', 'robust', 'enhance[sd]?', 'additionally', 'moreover', 'furthermore', 'quietly', 'profound', 'resonates?']),
    why: 'Common AI word; fine once, a tell in groups', fix: 'Prefer the everyday word.' },
  { id: 'inflation', sev: 2,
    re: words(['stands? as a', 'serves? as a', 'plays? a (?:key|crucial|pivotal|vital|significant) role', 'marking a (?:pivotal|significant|major)', 'a rich (?:history|heritage|tradition)',
      'the future (?:looks|is) bright', 'the future of [a-z]+ is (?:here|now)', 'exciting times', 'lasting legacy', 'indelible mark', 'reflects a broader', 'boasts']),
    why: 'Ordinary fact dressed as significance', fix: 'Keep the fact, drop the significance; use is/has.' },
  { id: 'ing-rider', sev: 1, re: /,\s(?:highlighting|underscoring|emphasizing|reflecting|symbolizing|showcasing|fostering|cultivating|ensuring)\b/gi,
    why: '"-ing" phrase bolted on to sound deeper', fix: 'Cut it unless the source says so.' },

  // Email filler
  { id: 'email-filler', sev: 2,
    re: words(['i hope (?:this|my|the) (?:email|message|note) finds you well', 'i hope you(?:\'re| are) (?:doing )?well', 'i wanted to (?:reach out|touch base|circle back|follow up)',
      'just (?:wanted to )?(?:reaching out|checking in|circling back|following up)', 'circle back', 'touch base', 'moving forward', 'going forward', 'per my last email',
      'please (?:do not|don\'t) hesitate to', 'at your earliest convenience', 'feel free to', 'let me know if you have any questions']),
    why: 'Stock email filler', fix: 'Start with the news or the request.' },

  // E. Chat leftovers
  { id: 'chatbot', sev: 3,
    re: words(['great question', 'i hope this helps', 'hope this helps', "you'?re absolutely right", 'certainly!', 'absolutely!', 'of course!', 'happy to help',
      'as an ai', 'i cannot browse']),
    why: 'Chatbot wrapper left in', fix: 'Delete it.' },

  // Social posts
  { id: 'hashtag-pile', sev: 2, re: /(?:#\w+[\s,]*){3,}/g, modes: ['post'],
    why: 'Three or more hashtags read as bot copy', fix: 'Zero or one hashtag.' },
  { id: 'emoji-pile', sev: 2, re: /(?:\p{Extended_Pictographic}️?\s*){2,}/gu, modes: ['post'],
    why: 'Emoji stacks', fix: 'One emoji at most, only if it carries meaning.' },
  { id: 'bullet-emoji', sev: 2, re: /^\s*(?:\p{Extended_Pictographic}|→|👉)️?\s/gmu, modes: ['post', 'prose'],
    why: 'Emoji or arrow as bullet', fix: 'Plain sentences.' },

  // D. Formatting (prose)
  { id: 'bold-label', sev: 1, re: /^\s*[-*]\s+\*\*[^*\n]{1,40}:?\*\*:?/gm, modes: ['prose'],
    why: 'Bold label on every bullet', fix: 'Turn into prose if the labels add nothing.' },
];

// Lines we never scan: fenced code, inline code, URLs, and lines marked voice-ok.
function maskLine(line) {
  return line.replace(/`[^`]*`/g, m => ' '.repeat(m.length)).replace(/https?:\/\/\S+/g, m => ' '.repeat(m.length));
}

export function check(text, { mode = 'prose', ignore = [] } = {}) {
  mode = ALIASES[mode] ?? mode;
  if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}" (use ${MODES.join(', ')})`);
  const lines = String(text).split(/\r?\n/);
  let inFence = false;
  const kept = lines.map(l => {
    if (/^\s*```/.test(l)) { inFence = !inFence; return ''; }
    if (inFence || /voice-ok/i.test(l)) return '';
    return maskLine(l);
  });
  const body = kept.join('\n');
  const starts = [0];
  for (let i = 0; i < body.length; i++) if (body[i] === '\n') starts.push(i + 1);
  const lineOf = idx => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo; };

  const hits = [];
  for (const r of RULES) {
    if (ignore.includes(r.id)) continue;
    if (r.modes && !r.modes.includes(mode)) continue;
    r.re.lastIndex = 0;
    for (const m of body.matchAll(r.re)) {
      const li = lineOf(m.index);
      hits.push({ id: r.id, sev: r.sev, level: SEV[r.sev], line: li + 1, col: m.index - starts[li] + 1, match: m[0].trim(), why: r.why, fix: r.fix });
    }
  }
  hits.sort((a, b) => a.line - b.line || a.col - b.col);

  const wordCount = (body.match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
  const count = s => hits.filter(h => h.sev === s).length;
  const strong = count(3), medium = count(2), weak = count(1);
  // FAIL: any strong tell. REVIEW: several medium/weak tells for the length. PASS otherwise.
  const per100 = wordCount ? (medium * 2 + weak) * 100 / wordCount : 0;
  // A single medium or weak hit never makes REVIEW on its own: one pattern is not a pile-up.
  const verdict = strong > 0 ? 'FAIL' : (medium >= 3 || (per100 >= 6 && medium + weak >= 2)) ? 'REVIEW' : 'PASS';
  return { verdict, mode, words: wordCount, strong, medium, weak, hits };
}

export function format(result, { file } = {}) {
  const head = `${file ? file + ': ' : ''}${result.verdict} (${result.mode}, ${result.words} words; strong ${result.strong}, medium ${result.medium}, weak ${result.weak})`;
  const rows = result.hits.map(h => `  ${String(h.line).padStart(4)}:${String(h.col).padEnd(3)} ${h.level.padEnd(6)} ${h.id.padEnd(15)} "${h.match}"  → ${h.fix}`);
  return [head, ...rows].join('\n');
}
