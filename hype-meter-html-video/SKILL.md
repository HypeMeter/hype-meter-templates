---
name: hype-meter-html-video
description: Make a short video (a Short, a Reel, an X clip, a YouTube intro or explainer) by writing one web page that can draw any moment of the video, then saving every frame and joining them into an mp4. No video AI model, no editing app. Good for title cards, kinetic text, animated charts, before/after, step-by-step explainers and photo slideshows with motion. Triggers - "make a video", "make a Short about", "animate this", "turn this into a clip", "html video", "video from code", "make this chart move", "motion graphics".
---

# HTML Video

A video is just pictures shown fast, 30 per second. So instead of asking a video model and hoping, Claude writes a web page with one function, `renderFrame(t)`, that draws exactly what the screen should show at time `t`. A headless browser calls it for every frame, saves each picture, and ffmpeg joins them into an mp4. Because every frame comes from code, you can fix one word or one color and render again in seconds.

## Where to run things
Work in the folder where the user wants the video, and call the scripts from this skill's folder:
```
SKILL=~/.claude/skills/hype-meter-html-video   # wherever this skill is installed
node "$SKILL/check.mjs" my-video.html
```
Every file the scripts write (stills, sheets, videos) lands in the folder you run them from. If a script says puppeteer or ffmpeg is not found, the one-time install in README was skipped: run `npm i` in the skill's folder (or set `PUPPETEER_MODULE`, `CHROME_PATH`, `FFMPEG_PATH` as README shows).

## Steps
1. **Agree on the video before drawing.** Ask the user (or decide, if no one is there, write it in `shot-list.md` next to the page, and show it when they are back):
   - **Format:** vertical 1080 x 1920 (Shorts, Reels, TikTok, X) or wide 1920 x 1080 (YouTube). Length in seconds (6 to 60 is the sweet spot for this method).
   - **The first frame.** The very first picture is what people see before they tap or while they scroll. It must already show the hook (the big words, the question, the striking picture), not a blank or a fade from black.
   - **A shot list:** a short table of time ranges, what is on screen, and the exact words on screen. Show it to the user before building.
   - **The facts.** For every number or claim on screen, where it comes from, and which ones are approximate (say so on screen). Leave out numbers you can't stand behind.
2. **Copy `template.html`** into the work folder, rename the file and its `<title>`, and fill in:
   - `window.VIDEO = { width, height, fps, seconds }` (keep fps at 30);
   - `SHOTS` with the time ranges from the shot list;
   - `renderFrame(t)` that draws each shot with the helpers already in the template (`progress`, `ease`, `fade`, `text`, `cover`, `rand`, `img`).
   Rules that make it render correctly:
   - **Everything comes from `t`.** No `Date.now()`, no `Math.random()` (use `rand(seed)`), no counters that grow each frame. The renderer may draw frames in any order.
   - **Draw on the one `<canvas>`.** Text goes on the canvas with `text()`, not as HTML on top (HTML is not saved).
   - **Nothing from the internet.** No CDN scripts, no web fonts, no image links. Pictures go in the same folder, are listed as `<img hidden id="..." src="...">` in the page, and are drawn with `cover(img('id'), x, y, w, h)`. Only use pictures the user has the right to use.
   - **Big text.** With the short side at 1080 px (both formats), main text 54 px or more, headlines 100 px or more; small print (source lines, axis labels, "approximate" notes) no smaller than 28 px. On vertical videos keep words out of the bottom 25% and the right 12%, where the app puts its buttons and captions (the template's `text()` default width already stays out of the right 12% when centered). `text()` puts the middle of the first line at `y` and adds lines below it, so leave room under wrapped text. On wide videos pass a wider `maxWidth` (for example `W * 0.9`).
   - **Cuts.** Two shots that meet both fade at the cut, a short blink. For a hard cut use `fade(t, shot, 0, 0)`.
3. **Check it:** `node "$SKILL/check.mjs" <page.html>`. It fails if the page loads anything from the internet, has errors, or never changes, and, at 9 moments spread over the video (always including the first and last frame), if a frame is blank (one color) or comes out different when drawn twice. Fix until it passes.
4. **Look at it before the full render.** `node "$SKILL/render.mjs" <page.html> --sheet sheet.jpg` puts 8 frames on one picture, from the first frame to the last; `--stills 0,3.5` saves single frames at full size. The sheet's evenly spaced frames can miss a key moment, so also take stills at the moment each shot's main words are fully on screen. Open them (Claude can read the image file) and check: is the first frame the hook, is any text cut off, overlapping or too small, is a word left alone on a line (break it with `\n`), does every shot read in the time it is fully on screen (about 3 main words per second, not counting fades or small print), does it end on a clear final frame instead of fading to nothing? Optional for people: open the page in a browser (`open page.html` on a Mac); it plays in a loop with a pause button and a time slider.
5. **Render:** `node "$SKILL/render.mjs" <page.html> --out video.mp4`. Add `--audio voice.mp3` for a voice-over or music you have the rights to; the video keeps its own length, so make `seconds` match the audio. With a voice-over, write down when each sentence starts and set the `SHOTS` times from that. `--from 3 --to 6` renders just a slice when you are fixing one part (saved as `<page>-3-6.mp4` unless you give `--out`).
6. **Before posting, read the words on screen once more:**
   - Every number or claim must be true. If a frame shows a source label ("Source: ..."), that page must actually say that fact. A label next to a fact that the page does not say makes people think it is the proof.
   - If the data is made up for a demo, the frame says so.
   - No private names, emails, keys or screens with account details.

## Good first videos
`prompts.md` has 8 copy-paste prompts (kinetic title, animated chart, before/after, 3 steps, quote card, countdown, photo slideshow, explain a number). `examples/` has two finished pages to copy from.

## Honest limits
- This makes motion graphics: text, shapes, charts, diagrams, your own photos moving. It does not make realistic footage of people or places; that needs a video model.
- A picture shown much bigger than its real size (more than about 1.5x) looks blurry. Use pictures at least as big as they appear on screen.
- The checker proves the page renders cleanly. It cannot tell you if the video is clear, true, or good. Look at the sheet, and ask the user to watch it.

## Don't
- Don't skip the shot list. Building first and deciding later is where most re-renders come from.
- Don't add sound effects or music you did not make or have a license for.
- Don't put the whole explanation on screen. One idea per shot, few words, big.
