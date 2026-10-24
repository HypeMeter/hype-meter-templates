---
name: play-page
description: Turn a "how does this work?" or "why does this happen?" question into one interactive web page the user can play with (sliders, buttons, a look-inside view), check that it really works, and record a short video of it. Use when the user wants to understand something hard, explain it to someone else, or make a visual post or Short about it. Triggers - "build me a page I can play with", "make this interactive", "help me understand how X works", "play page", "explain this with a simulation".
---

# Play Page

Reading an explanation is passive. Moving a slider and watching the answer change is how most people actually get it. This skill builds one small page for one question, checks it, and turns it into a video.

## Every play page has 6 parts
1. **The thing.** A recognisable object or system drawn on the page (a planet and its moon, an API key with a spending cap, a reviewer and a pile of notes). Not an abstract chart on its own.
2. **The controls.** 1 to 3 sliders, a select, or step buttons. Each one changes one real input.
3. **The look inside.** A part of the drawing that shows what is happening underneath (the side of the Moon facing Earth, the money left on the key, the real bugs vs the nitpicks).
4. **The numbers.** A short live readout under the drawing. All numbers come from one small model written in the page, not made up per frame.
5. **The words.** One line at the top that says what to try first, and one result sentence that updates when the controls move.
6. **The one-line idea.** One sentence under everything that the user should remember.

## Steps
1. **Pin down the question and the one-line idea.** Ask the user (or decide with them) the question in plain words and the one sentence they should remember. If there's no one to ask, decide both yourself, write them at the top of your plan, and still show the model (step 2) and the finished page (step 5) when the user is back. If they can't say the idea in one sentence, the page will be fuzzy. Write both at the top of your plan.
2. **Write the small model first.** In plain words, list the inputs, the formula or rules, and the outputs. Say clearly where it is simplified ("this is a sketch, not real data"). Show it to the user before drawing anything.
3. **Build one HTML file** with the 6 parts:
   - single file, no external scripts, fonts or images (works offline);
   - works at phone width (390 px) with no sideways scrolling, and on a laptop;
   - light and dark mode (`prefers-color-scheme`); if you draw with JavaScript, read the colors inside the update function and redraw when the theme changes (`matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update)`);
   - the result sentence lives in an element with `data-result`;
   - every control has an `id` and a visible label;
   - keep the drawing in an SVG or a canvas; keep text as real text, not inside the image.
4. **Check it** with `node check.mjs <page.html>` from this folder (see README for the one-time install). It opens the page at phone and laptop width and fails on console errors, anything loaded from the internet, or sideways scrolling. Then it moves every control once (each slider to its max, or to its min if it is already at max; each select to another option; it clicks every `<button>`), leaving them there, and checks that the result sentence changes and never shows NaN, undefined, Infinity or [object. So every button must change the sentence (leave reset or copy buttons out, or make them change it), and handle edge values like 0 with a different sentence instead of dividing by zero. Fix until it passes.
5. **Look at it yourself, then ask the user to.** Open it in the browser. A checker can't tell you if it is clear or ugly. Ask: "What do you think happens if you move X?" If the user can't guess, the page needs a better first-try hint.
6. **Record a video** (optional) with `node record.mjs <page.html> --out clip.mp4`. It records a vertical 1080x1920 clip (the whole page, from title to the one-line idea, should fit a 540x960 screen; keep the drawing under about half the screen height, and if the drawing grows with a slider, cap its height). By default it sweeps each slider from start to end and presses each button. For a better story, add a demo script to the page, for example `<script type="application/json" id="demo">[{"sweep":{"days":[0,27.3]},"seconds":5},{"set":{"spin":0},"sweep":{"days":[0,27.3]},"seconds":5}]</script>`: each step sets controls by id, then slides the sweep controls over the given seconds. Good for an X post or a Short. Add the one-line idea as the post text.
7. **Get a fresh pair of eyes** (optional): if you have the fresh-critic skill, run it on the page's text and one-line idea before you share it.

## Copy-paste prompts
`prompts.md` in this folder has 10 starting prompts (science, money, AI, everyday objects). Use them as is or swap the question.

## Don't
- Don't fake precision. If the model is a sketch, the page must say so in one line.
- Don't pack two ideas into one page. Make two pages.
- Don't load anything from the internet (no CDN, no web fonts). The page should open from a file.
- Don't put private data in a page you plan to share.
