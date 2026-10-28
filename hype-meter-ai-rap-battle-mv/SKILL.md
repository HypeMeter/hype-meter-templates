---
name: hype-meter-ai-rap-battle-mv
description: Make a vertical AI music video (Shorts, Reels, TikTok) in which two characters rap at each other, from one AI-generated song: lyrics, a song where the two rappers sound different, lip-synced and story shots, lyric captions, fact cards and an edit cut on the song's timing. Use for "rap battle", "diss track video", "AI music video", "make an MV", "two characters rap", "Romeo vs Shakespeare style". Free local tools plan, time, check and cut; the song, pictures and clips come from paid AI services (websites, or optional API scripts with your own keys).
---

# AI Rap Battle MV

One song, two characters, about 60 seconds. Our example, "Romeo vs Shakespeare", is 59 seconds and cost USD 4.13 in pictures and video clips, plus credits from an ElevenLabs subscription for the song.

The free script `battle.mjs` does the fiddly parts: the song plan, finding when each line is sung, the list of what to generate, cutting audio for lip-sync, checking, captions and the final edit. The song, the pictures and the clips come from AI services. The user makes those on the websites, or, if they have API keys, with `api.mjs`.

## Where to run things
Each video is a project folder. Start one with `node "$SKILL/battle.mjs" new my-battle`, which makes a blank `project.json`, `lyrics.md`, `shots.json` and `facts.md`. Look at `example/romeo-vs-shakespeare` for a filled-in one, but don't copy its `words.json` into a new project: it is the timing of Romeo's song. Work from the folder that holds the project, and call the scripts from this skill's folder:
```
SKILL=~/.claude/skills/hype-meter-ai-rap-battle-mv   # wherever this skill is installed
node "$SKILL/battle.mjs" check my-battle
```
If a script says ffmpeg or puppeteer is not found, run `npm i` in the skill's folder once (README).

A project folder holds:
- `project.json`: the characters (voice styles, color, look), beat styles, video length, picture style, fact cards.
- `lyrics.md`: the lyrics.
- `shots.json`: the shot list.
- `facts.md`: every fact in the lyrics and cards, with its source.
- Folders the steps fill in: `cast/`, `frames/`, `audio/`, `clips/`, `build/`.

### project.json fields
| Field | What it is |
|---|---|
| `name` | File name of the finished video |
| `end` | Video length in seconds. Before the song exists, use the total that `plan` prints; `retime` sets it from the real song |
| `song`, `lyrics` | File names (default `song.mp3`, `lyrics.md`) |
| `beat` | Music styles shared by every part (genre, drums, instruments) |
| `characters.<Name>` | One entry per singer; `<Name>` must match the `[Name]` lines in lyrics.md exactly (two words are fine) |
| ...`.voice` / `.avoid` | Styles for that singer's parts, and styles to keep out |
| ...`.sectionSeconds` | Length of each of their parts (default: 2.9 s per line) |
| ...`.color` | Their color: the caption box border and their name inside it |
| ...`.look`, `.sheet` | Character-sheet prompt, and where the sheet picture goes |
| ...`.performs` | Lip-sync prompt (how they move while singing) |
| `both` | Same as a character, for the `[Both]` parts (`voice`, `color`, `sectionSeconds`) |
| `frameStyle` | Added to the end of every picture prompt (look, light, "no text") |
| `titleSeconds` | How long the "A vs B" title stays up (default 3.6) |
| `cards` | Fact cards: `{ "t0", "t1", "text", "note" }`, with the source in `note` |

### shots.json fields
Each shot has `id`, `t0`, `t1` (seconds) and `type`, which is `lipsync`, `motion` or `still`. Then:
- `frame`: the prompt for its first picture. Or `image`: an existing picture to reuse.
- `who` (lipsync): the singer. `Both` is allowed but uploads no sheet; for duets the example uses a `motion` shot instead.
- `refs`: which character sheets to upload with the frame prompt. For lip-sync shots it defaults to `who`.
- `a0` / `a1` (lipsync): the seconds of the song that drive it.
- `motion` (motion): what moves. `seconds` (optional): the clip length; the default is the shot length plus 0.2 s, rounded up.
- `in` (motion): seconds skipped at the start of the clip (default 0.2).
- `prompt` (lipsync): replaces the singer's `performs`.
- `note`: anything for you; the scripts ignore it.

## Rules before anything else
- **Characters:** fictional characters, characters from public-domain stories, or historical people who died long ago. Never a real living person, never a real singer's voice or face. Check that AI-made faces don't look like a real celebrity. Everyone shown is an adult.
- **Song prompts:** don't name real artists or real people as the singer. ElevenLabs refuses those prompts. Describe the voice instead ("old man rapper with a deep, gravelly voice").
- **Facts:** every fact in the lyrics or on a card must be true. List each one with its source in `facts.md`, and put the list in the video description.
- **Faces of real historical people:** describe them from old portraits or photos and add "not resembling any real person or actor" to the `look` prompt, because the AI tends to copy a famous actor who played them. For example: "in the style of the well-known 1600s portraits of Shakespeare: balding with long side hair, white ruff collar... Not resembling any real person or actor."

- **Disclosure:** when uploading, mark the video as altered or synthetic content where the platform asks, and say in the description that it was made with AI.

## Steps
1. **The battle in 3 lines.** Agree with the user (or decide and write it in `idea.md`): who the two characters are, what they're mad at each other about, and how it ends (often they team up for the last chorus). The funniest battles mix an old world with a modern habit (left on read, doomscrolling, filters). Then run `new` and fill in `project.json`.
2. **Lyrics** in `lyrics.md`: a `[Name]` line before each part, the lines below it, then `[Both]` for the chorus. About 4 parts of 4 lines plus a 4-line chorus is about 60 seconds. Make the lines short, punchy and rhyming. A good trick: ask a second AI (for example Grok) to "make it more savage", then pick the best lines yourself and drop any line that breaks the rules above. Show the user the lyrics before the song.
3. **The song plan (free).** `node "$SKILL/battle.mjs" plan <project>` writes `song-plan.json`, where each part gets the shared beat styles plus that character's voice styles (`voice` and `avoid` in project.json). This is what makes two rappers sound like two different people in one song. It also writes `song-prompt.txt`, and it prints estimated times for every line so you can plan shots before the song exists. Set `end` to the total it prints. The paid song comes later (step 7), after you have planned and previewed the video on these estimates.
4. **Characters and shots.**
   - In project.json, give each character a `look` (a character-sheet prompt) and a `sheet` file name.
   - In `shots.json`, list shots that cover the whole song with no gaps, mostly 1.5 to 5 seconds (a short still under 1 second is fine), cutting where the singer or the line changes. Use the line times from `lines` (or from `plan`'s estimates before the song exists).
   - Use about 40% `lipsync` shots: the character sings to the camera. Give `who`, and `frame`, the prompt for its first picture, with the mouth closed. Optional `a0`/`a1` set which seconds of the song drive it; the default is the shot plus 0.1 s on each side, at least 2 s.
   - Make the rest `motion` shots: a story picture that moves. Give `frame` and `motion`.
   - A `still` shot is a picture with a slow zoom; give `frame` or `image`.
   - `refs` lists which character sheets to upload with a frame prompt.
   - Put true facts the lyrics mention on `cards` in project.json, with the source in `note`. Keep them short (text up to about 28 characters, note up to 40), or they cover the picture.

   Run `node "$SKILL/battle.mjs" check <project>` and fix what it reports.
5. **Preview before spending.** Run `node "$SKILL/battle.mjs" cut <project> --preview`. It takes about a minute and prints nothing until it's done. Shots that don't have their pictures or clips yet show as cards with their prompts, and the captions are timed to the song. Watch it with the user: this is the cheapest moment to change the lyrics, the shots or the timing. It works even before the song exists; the caption times are then estimated from the song plan, and the video is silent.
6. **What it will cost.** `node "$SKILL/battle.mjs" todo <project>` writes `todo.md`: every character sheet, picture and clip, with the prompt, the file name to save it as, and an estimate in USD. Show the estimate to the user before making anything that costs money.
7. **The song.** Make it once the plan, preview and cost are agreed.
   - **On the website:** paste `song-prompt.txt` into ElevenLabs Music. Where the editor lets you set styles per section, use the ones from the file. Download the result as `song.mp3` into the project.
   - **With an API key:** `node "$SKILL/api.mjs" song <project> --yes`.
   - Then listen. If the two voices don't sound clearly different, make the styles more extreme (high and fast vs deep and slow) and make the song again. Every new song costs credits again.
8. **When each line is sung.** You need a timed transcript of the song.
   - **With an API key:** `node "$SKILL/api.mjs" words <project> --yes` saves `words.json`.
   - **On the website:** run ElevenLabs speech-to-text on the song, download the subtitles, and save them as `words.srt`. Any captions tool that exports .srt works.

   Then `node "$SKILL/battle.mjs" lines <project>` matches the lyrics to it and writes `lines.json`. Each line shows its start, end and how many of its words were heard (10/11 = 10 of 11). Lines marked GUESS weren't heard clearly: play the song and fix their times in `lines.json` by hand. If you planned shots on the estimated times, run `node "$SKILL/battle.mjs" retime <project>`. It moves every shot, lip-sync window and card to the real line times, sets `end` to the song's length (or `--end 59.4` to choose it), and keeps the old files as `*.before-retime.json`. It assumes the shots were planned on `plan`'s estimates for the current lyrics and section lengths, so don't change `sectionSeconds` between planning shots and running it. After retiming, check the first lip-sync shot: if it now starts well before the first sung line, shorten it so you don't pay to lip-sync the intro.
9. **Pictures.** Make the character sheets first, then one 9:16 first picture per shot, uploading the sheets so faces stay the same. Use any image tool on the web (we used Google's Nano Banana model), or run `node "$SKILL/api.mjs" cast <project> --yes` then `node "$SKILL/api.mjs" frames <project> --yes`. Look at every picture. Remake any where a face changed, a hand looks wrong, or there's text in the picture.
10. **Clips.**
   - `node "$SKILL/battle.mjs" segments <project>` cuts the song into `audio/<shot>.mp3` for each lip-sync shot.
   - **Lip-sync:** a talking-avatar tool (we used Kling's AI Avatar) takes the shot's picture plus its audio file. The full song with the beat works; you don't need to separate the vocals first.
   - **Motion:** an image-to-video tool (we used Wan 3.0 at 480p) takes the picture plus the `motion` prompt.
   - Save each clip as `clips/<shot>.mp4`, or run `node "$SKILL/api.mjs" clips <project> --yes`.
   - Watch every clip. If the end of a clip has an odd moment, shorten the shot, or add a `still` shot that reuses another picture with `image` (the example does this at s05r).
11. **Cut.** Run `node "$SKILL/battle.mjs" check <project> --final`, then `node "$SKILL/battle.mjs" cut <project>`. You get `build/<name>.mp4`: 1080x1920, the song mixed to about -14 LUFS, with captions (the singer's name inside each caption box, in their color, so it stays right when the picture cuts away; at most two lines, above the area phone apps cover), the title and cards. Watch it with sound, on a phone if you can, before it goes anywhere. Each cut keeps only the finished video in `build/`; the working pieces (about 200 MB) are deleted.


## What it cost us (Romeo vs Shakespeare, Oct 2026)
- 59 seconds, 25 shots: 9 lip-sync, 14 motion, 2 stills.
- USD 4.13 in pictures and clips at CometAPI list prices: lip-sync about USD 0.053 per second, motion about USD 0.05 per second at 480p, about USD 0.02 per picture, including a few redos.
- The song used ElevenLabs subscription credits.
- `todo` estimates the same project at USD 4.05 before redos.

## Honest limits
- The AI services change their prices, limits and rules often. Check them before a big run.
- Lip-sync is good from the front and weak from the side. Keep lip-sync pictures facing the camera.
- AI video adds strange hands and gestures now and then. Watch every clip.
- The captions show the lyrics as written, timed by the transcript. If the singer changed a word, edit it in `lines.json`.
- `api.mjs` was tested against recorded responses, not a live run of this exact script. The video itself was made with the same services and request formats.
