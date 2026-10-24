# Trend Scout (Claude Skill)

Find videos in your niche that are beating their own channel's normal views, and turn them into ideas for your channel.

Example output: a table like this, sorted by how much each video beat its channel's usual views.

| Outlier | Views | Channel usually gets | Days old | Video |
|---|---|---|---|---|
| 18× | 1.7M | 92K | 13 | I Tested The Viral Github Repo That Reverse Engineers Anything |

## Install (Claude Code / Claude desktop app, Code tab)
1. Copy this whole `trend-scout` folder into `~/.claude/skills/` (create the folder if it isn't there).
2. You need Node 18 or newer (`node -v`). Nothing else to install.
3. Get a free API key (below) and save it.
4. In a new chat, say: "Scout my niche: claude skills, ai for small business."

## Get a free API key (about 5 minutes)
1. Go to https://console.cloud.google.com/ and sign in with any Google account.
2. Create a project (top bar → project menu → New project). Any name.
3. Search for "YouTube Data API v3" → Enable.
4. Go to "APIs & Services" → "Credentials" → "Create credentials" → "API key".
5. Click the new key → "API restrictions" → restrict it to "YouTube Data API v3" → Save. (So the key can't be used for anything else.)
6. Save it on your computer, not in a chat:
   - Mac: open Terminal and run `echo 'export YOUTUBE_API_KEY=PASTE_YOUR_KEY_HERE' >> ~/.zshrc`, then open a new Terminal window.
   - Windows: search "Edit environment variables for your account", add `YOUTUBE_API_KEY` with your key.

The free quota is 10,000 units a day. One run with 3 phrases uses about 400.

## Run it yourself (without Claude)
```
node scout.mjs --days 14 --format long "claude skills" "ai agents for non coders"
```
Options: `--days 30`, `--min-views 5000`, `--min-baseline 1000` (skip tiny channels), `--format any|long|short`, `--lang en` (or `--lang ""` for any language).

## Honest limits
- It only sees what YouTube search returns (about 25 videos per phrase).
- Language filtering isn't perfect: many videos don't say what language they're in.
- A high number means "worth a look", not "copy this". You decide.

Tests: `node scout.test.mjs` (offline, no key needed).

From the Hype Meter video on Claude Skills for YouTube. Free, no email, no sign-up.
