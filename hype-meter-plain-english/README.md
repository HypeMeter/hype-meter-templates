# Plain English: make AI-written English sound like you

A free Claude skill. You paste an email, a post, a script or a description. Claude runs a free checker that finds the patterns that make English read as AI-written. It rewrites those parts and keeps every fact. Over time it learns how you write from the corrections you make.

**Before** (the checker says FAIL)
> Here's the thing: AI can now read your PDFs. 🚀🔥 I tested it, and the results? Mind-blowing. This isn't a tool. It's a superpower. Let that sink in. #AI #productivity #tools <!-- voice-ok -->

**After** (PASS)
> I gave an AI a 40-page lease and asked when I can leave early.
>
> It found the clause on page 31. It also missed the fee on page 33.
>
> Useful for finding things. Still read the page it points to.

More pairs: two emails, a video description and a voice-over line, in [examples/before-after.md](examples/before-after.md).

## What's in the folder
| File | What it does |
|---|---|
| `SKILL.md` | How Claude checks, rewrites and hands back your text |
| `check.mjs` | The checker you run. Free, offline, nothing to install |
| `plain.mjs` | The patterns it looks for (about 20 kinds of pattern; `--rules` lists them) |
| `voice-card-template.md` | A page where your own corrections become rules, so Claude learns your voice |
| `examples/before-after.md` | 5 before-and-after pairs |
| `test.mjs` | Tests (`node test.mjs`) |
| `THIRD-PARTY-NOTICES.md` | Credits and licenses for the two open projects the patterns come from |

## Install (2 minutes)
You need [Node.js](https://nodejs.org) 18 or newer and Claude Code (or the Code tab of the Claude desktop app). There is nothing else to install.

1. Get the folder: on https://github.com/HypeMeter/hype-meter-templates click Code → Download ZIP, unzip it, and copy the `hype-meter-plain-english` folder into `~/.claude/skills/` (create that folder if it isn't there).
2. Check that it works: `node ~/.claude/skills/hype-meter-plain-english/test.mjs` should end with `28 passed, 0 failed`.
3. In Claude, say: "plain English: make this sound less like AI" and paste your text.

## Use the checker yourself
```
SKILL=~/.claude/skills/hype-meter-plain-english
node "$SKILL/check.mjs" draft.md                          # emails, articles, descriptions
node "$SKILL/check.mjs" post.txt --mode post              # X, LinkedIn, Threads
node "$SKILL/check.mjs" script.txt --mode script          # anything read aloud
node "$SKILL/check.mjs" --text "Let that sink in." --mode post
node "$SKILL/check.mjs" --rules                           # what it looks for
```
On a Mac, `pbpaste | node "$SKILL/check.mjs" - --mode post` checks whatever you just copied.

It prints a verdict and every hit with its line number and a suggested fix:
- **FAIL**: at least one strong pattern, like `It's not X, it's Y` or `Let that sink in`.
- **REVIEW**: three or more medium ones, like `delve`, `seamless` or dashes everywhere, or at least two smaller hits packed into a short text. One hit on its own never makes REVIEW.
- **PASS**: no pattern problems.

The exit code is 1 for FAIL and 0 for REVIEW or PASS, so you can use it in scripts.

A line you wrote that way on purpose is skipped if it contains `voice-ok`. In Markdown you can hide it in a comment, `<!-- voice-ok -->`, which is why one appears in the example at the top of this page.

Other mode names work too: `x`, `tweet` and `social` mean `post`, and `email` means `prose`.

## Honest limits
- It finds patterns, not quality. A PASS can still be dull or wrong. Read it aloud.
- English only.
- It isn't an AI detector and doesn't try to fool one. One pattern doesn't mean AI wrote something.
- The rules are English-writing habits we and two open projects collected. Your field may use some of these words for good reasons. Use `--ignore` for a rule, or `voice-ok` for one line.

MIT license. The patterns are adapted from [blader/humanizer](https://github.com/blader/humanizer) and [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop), both MIT. Made by Hype Meter: AI tools for people who don't code. Tested, not hyped.
