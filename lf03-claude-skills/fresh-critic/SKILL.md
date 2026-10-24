---
name: fresh-critic
description: Review a finished piece of work (video script, title and thumbnail text, video description, email, post) with a brand-new reviewer that never saw how it was made. Use before publishing or sending anything that goes public, costs money, or is hard to undo. Triggers - "check this before I post", "fresh eyes", "critic", "review my script", "is this ready to publish", "second opinion".
---

# Fresh Critic

The person (or AI) who made something is the worst one to check it: they read what they meant, not what they wrote. This skill hands the finished thing to a reviewer that has none of the backstory.

## Steps
1. **Get only the finished thing.** Ask the user for the final text (or file path). If you helped make it in this chat, still pass only the final version, never the conversation or your reasoning.
2. **Pick a rubric** from this folder:
   - `rubric-video.md` for a video script, title, thumbnail text or description
   - `rubric-general.md` for anything else (email, post, page)
   If the user has their own rules (a style guide, a channel handbook), add them under the rubric.
3. **Start a fresh reviewer.** Use a new subagent (Task / Agent tool) with a prompt that contains ONLY:
   - the rubric text,
   - the finished thing,
   - today's date,
   - this instruction: "You did not make this and owe it nothing. Reply with a verdict on the first line (SHIP or FIX), then at most 5 problems, most important first. For each: severity (blocking / major / minor), where it is (quote a few words), what's wrong, and a concrete fix. If something is fine, don't mention it."
   Never include the chat history, earlier drafts, or why choices were made.
4. **Show the user the review as is.** Don't defend the work or soften the points. Add one line per point only if you have facts the reviewer couldn't know (for example "this number is checked in the test log").
5. **The user decides.** Ask which points to apply. Apply only those.
6. **Log it** (optional but useful): append one row per point to `critic-log.md` in the user's project folder:
   `| date | what was checked | point (short) | used? yes/no | why |`
   After a few weeks this shows whether the critic is worth it.

## Want a second opinion from another company's AI?
For anything important, also give the user this copy-paste block for ChatGPT, Gemini or Grok (a new chat), filled in with the same rubric and finished thing:

```
You did not make this and owe it nothing. Using the rules below, reply with SHIP or FIX on the first line, then at most 5 problems, most important first: severity, where (quote), what's wrong, a concrete fix.

RULES:
[paste rubric]

FINISHED THING:
[paste the work]

Today's date: [date]
```
Different models tend to catch different things. Don't let the reviewers see each other's answers.

## Don't
- Don't let the critic rewrite the whole thing. It points; the user decides.
- Don't send private data (keys, passwords, customer details) to any reviewer. Remove them first.
- Don't run the critic on its own output and call it a second opinion.
