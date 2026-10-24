---
name: trend-scout
description: Find YouTube videos in your niche that are beating their own channel's normal views ("outliers"), then turn the top ones into video ideas. Use when the user asks "what's working in my niche", "find video ideas", "what's trending on YouTube for X", "scout my niche", or wants topic research before making a video. Needs Node 18+ and a free YouTube Data API key in YOUTUBE_API_KEY.
---

# Trend Scout

Finds videos that did much better than their channel usually does. A 3× outlier means the idea or the packaging worked, not just a big channel being big.

## Before you run
1. Check that `YOUTUBE_API_KEY` is set (`echo $YOUTUBE_API_KEY` prints something). If not, walk the user through README.md section "Get a free API key" and stop until it's set. Never ask the user to paste the key into the chat.
2. Ask the user for 2–4 search phrases that describe their niche, the way a viewer would type them (for example "claude skills", "ai for small business"). Don't guess them.

## Run
From this skill's folder:
```
node scout.mjs --days 14 --format long "phrase one" "phrase two"
```
- `--format long` for long videos, `short` for Shorts, `any` for both.
- `--days 30` if the niche is slow; `--min-views 5000` for small niches; `--lang ""` to allow every language.
- It writes `trend-scout-YYYY-MM-DD.md` in the current folder and prints how many quota units it used (about 100 per phrase; the free daily quota is 10,000).

## Then
1. Read the report. Look at the top 10 rows only.
2. Tell the user, in plain words:
   - 3–5 patterns you see in the titles (numbers, "I tested", "for beginners", a named tool, a strong result).
   - Which videos are probably one-offs (a celebrity, a lucky Short) and why.
   - 3 video ideas for the user's own channel that use a pattern, written as a plain title (search words first, what the viewer gets, a number with a unit).
3. Say clearly that this is a starting point: the user should open the top videos, watch the first 10 seconds, and decide.

## Don't
- Don't copy titles or scripts from the report. Learn the pattern, make your own.
- Don't download or re-upload anyone's video.
- Don't run it in a loop or many times a day; once or twice a week is enough and saves quota.
