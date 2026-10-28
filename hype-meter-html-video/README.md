# HTML Video: make a video by writing a web page

A free Claude skill. You describe a short video. Claude writes one web page that can draw any moment of it, checks that it renders cleanly, and turns it into an mp4. You don't use a video AI model or an editing app.

**How it works, in one line:** a video is 30 pictures a second. The page has one function, `renderFrame(t)`, that draws the picture for time `t`. A browser you never see calls it for every frame, and ffmpeg (a free video tool) joins the pictures into a video.

On our laptop, rendering takes about as long as the video or less: the 9-second vertical example took 3 seconds, a 12-second wide chart took 13.

## What's in the folder
| File | What it does |
|---|---|
| `SKILL.md` | The steps Claude follows: shot list first, then the page, check, look, render |
| `template.html` | The starting page Claude copies. It has the helpers for fading, moving, and wrapping text |
| `check.mjs` | Tests a page before rendering: no errors, nothing from the internet, same picture for the same moment, no blank frames |
| `render.mjs` | Makes the mp4. It can also save single frames, or 8 frames on one picture to look at |
| `prompts.md` | 8 copy-paste prompts for first videos |
| `examples/` | 2 finished pages: a vertical explainer and a wide animated chart |
| `test.mjs` | Tests for the checker and renderer (`node test.mjs`) |
| `package.json` | What `npm i` installs: puppeteer (a browser you never see) and ffmpeg |

## Install (about 5 minutes)
You need [Node.js](https://nodejs.org) (version 18 or newer) and Claude Code or the Code tab of the Claude desktop app.

1. Get the folder: on the GitHub page, click Code → Download ZIP, unzip it, and copy the `hype-meter-html-video` folder into `~/.claude/skills/` (create that folder if it isn't there; `~` is your home folder).
2. Open a terminal in that folder once and install the browser and ffmpeg:
   ```
   cd ~/.claude/skills/hype-meter-html-video
   npm i
   ```
   The first time, it takes about 2 minutes and shows nothing until the end, so it is not stuck (faster if you already have puppeteer's Chrome). It puts about 80 MB in `node_modules` inside the folder, plus a copy of Chrome (about 150 MB) in `~/.cache/puppeteer`. To remove it later, delete the skill folder. `~/.cache/puppeteer` is shared with any other tool that uses puppeteer, so delete it only if nothing else needs it.

   Already have puppeteer and ffmpeg somewhere? Skip `npm i` and set these in your shell profile (for example `~/.zshrc`) instead. When `PUPPETEER_MODULE` is set, it is used even if `npm i` was run:
   ```
   export PUPPETEER_MODULE=/path/to/node_modules/puppeteer
   export FFMPEG_PATH=/path/to/ffmpeg
   export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"   # needed if PUPPETEER_MODULE is puppeteer-core
   ```
3. Check that it works: `node test.mjs` should end with `27 passed`.
4. In Claude, say: "html video: make a 6-second vertical title card that says Nobody reads the second email".

## Try it yourself without Claude
Files are written to the folder you run the commands from, so use a scratch folder, not the skill folder:
```
mkdir -p ~/html-video-try && cd ~/html-video-try
SKILL=~/.claude/skills/hype-meter-html-video
node "$SKILL/check.mjs" "$SKILL/examples/how-video-works.html"
node "$SKILL/render.mjs" "$SKILL/examples/how-video-works.html" --sheet sheet.jpg
node "$SKILL/render.mjs" "$SKILL/examples/how-video-works.html" --out how.mp4
```
You can also open any page in a browser (on a Mac: `open "$SKILL/examples/how-video-works.html"`). It plays in a loop and has a pause button and a time slider.

| Command | What you get |
|---|---|
| `node render.mjs page.html --out video.mp4` | The full video |
| `... --audio voice.mp3` | The same video with your voice-over or music |
| `... --from 3 --to 6` | Just seconds 3 to 6, for checking a fix (saved as `page-3-6.mp4`, so it doesn't replace the full video) |
| `node render.mjs page.html --stills 0,4.5` | Single frames as jpg |
| `node render.mjs page.html --sheet sheet.jpg` | 8 frames on one picture |

## Honest limits
- It makes motion graphics: text, shapes, charts, diagrams, and your own photos moving. It can't make realistic footage of people or places. That needs a video model.
- The checker proves the page renders cleanly. It can't tell you if the video is clear or true. Look at the frames, and watch the video before you post it.
- Sound isn't made here. Bring your own voice-over or music, or post it silent with captions. Without `--audio`, the mp4 still gets a silent sound track, because some apps handle videos with no sound track badly.
- Fonts come from your computer, so text can look slightly different on another computer.

MIT license. Made by Hype Meter: AI tools for people who don't code. Tested, not hyped.
