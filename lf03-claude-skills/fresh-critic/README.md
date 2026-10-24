# Fresh Critic (Claude Skill)

Before you publish or send something, hand the finished version to a brand-new reviewer that never saw how it was made.

Why: the one who made it reads what they meant, not what they wrote. In my own log, a second, separate reviewer added a fix I actually used in 32 of 67 reviews, for about 5 cents each. Most of the time the reviewers agreed; the second look is insurance.

## Install (Claude Code / Claude desktop app, Code tab)
1. Copy this whole `fresh-critic` folder into `~/.claude/skills/`.
2. Nothing else to install. No API key.
3. In a chat, paste your final script (or title, description, email) and say: "Fresh critic this before I post."

## What you get back
A verdict (SHIP or FIX) and at most 5 problems, most important first, each with a concrete fix. You decide which to use.

## Files
- `SKILL.md`: what Claude follows
- `rubric-video.md`: for scripts, titles, thumbnail text, descriptions
- `rubric-general.md`: for emails, posts, anything else
- Add your own rules (style guide, channel handbook) under a rubric.

## Second opinion from another AI
The skill also gives you a copy-paste block for ChatGPT, Gemini or Grok. Different models catch different things. Don't let them see each other's answers.

From the Hype Meter video on Claude Skills for YouTube. Free, no email, no sign-up.
