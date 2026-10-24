# Daily Digest (Claude Skill)

Claude reads your X feed in your own Chrome, sorts it by the topics you care about, opens the best posts, and gives you a one-page summary. You stop scrolling; you read one page.

It's read-only: it never likes, reposts, follows or posts.

## Install (Claude Code / Claude desktop app, Code tab)
1. Copy this whole `daily-digest` folder into `~/.claude/skills/`.
2. Install the **Claude in Chrome** extension and sign in to X in that Chrome yourself. Claude never asks for your password.
3. Open `topics.md` and write your 3–7 topics.
4. In a chat, say: "Daily digest."
5. When it starts collecting, keep the X tab in front for about a minute. Chrome slows down tabs in the background.

## What you get back
An HTML page: 5–8 posts worth reading (with summaries and links), a short "skim" list, and how many posts it skipped and why. Plus a 3–5 sentence summary in chat.

## Honest limits
- It sees about 50 posts (For you + Following). That's what you'd scroll past in 10–20 minutes, not everything.
- X changes its page often. If collecting stops working, the page layout changed; tell Claude "the collector found 0 posts" and it can adjust.
- It sorts by your topics, so a great post outside them may land in "skip".
- How good the sorting is depends on how clearly you write `topics.md`.

From the Hype Meter video on Claude Skills for YouTube. Free, no email, no sign-up.
