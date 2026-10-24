# Play Page: turn a question into a page you can play with

A free Claude skill. You ask "how does this work?" and Claude builds one web page with sliders and a look-inside view, checks that it really works, and can record a short vertical video of it.

## What's in the folder
| File | What it does |
|---|---|
| `SKILL.md` | The steps Claude follows (the 6 parts every page has) |
| `prompts.md` | 10 copy-paste starting prompts |
| `check.mjs` | Opens the page at phone and laptop width and tests every control |
| `record.mjs` | Records a 1080x1920 clip of the page, about 15 seconds |
| `examples/` | 3 finished pages: Moon, spending cap, AI review |

## Install (about 5 minutes)
1. Copy the `play-page` folder into `~/.claude/skills/` (create the folder if it's not there).
2. The page itself needs nothing. For the checker and the video, open a terminal in that folder (`cd ~/.claude/skills/play-page`) once and run:
   ```
   npm i puppeteer ffmpeg-static
   ```
   Already have them somewhere else? Set `PUPPETEER_MODULE` (path to puppeteer), `CHROME_PATH` (your Chrome) and `FFMPEG_PATH` (your ffmpeg) instead.
3. In Claude Code or the Code tab of the Claude desktop app, say: "play page: why does the Moon always show us the same face?"

## Use the checker and recorder yourself
Run these from inside the `play-page` folder:
```
node check.mjs examples/moon-same-face.html
node record.mjs examples/moon-same-face.html --out moon.mp4
```

## Honest limits
- The checker only proves the page runs and the controls do something. It can't tell you if the page is clear. You still have to look.
- The examples are sketches with simple models, and each page says so.
- The video sweeps the controls on its own. Add a short demo script to the page (see SKILL.md step 6) if you want a specific story.
