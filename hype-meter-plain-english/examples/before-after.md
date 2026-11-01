# Before and after

Five drafts written the way AI tools often write, and the same message rewritten. The verdicts are what `check.mjs` says, and `node test.mjs` checks that they still hold. Try one yourself:
`node check.mjs --text "Let that sink in." --mode post`

## 1. Email to a client (prose)

**Before** (FAIL)
> Great question! I wanted to circle back on the timeline. It's not just a delay, it's an opportunity to get this right. We're leveraging this extra week to ensure a seamless launch — and that changes everything. Let me know if you have any questions!

**After** (PASS)
> The launch moves from May 6 to May 13. We found two bugs in checkout last week and want them fixed before real customers see them. Nothing else on your side changes. I'll send the test link on Friday.

What changed: the real news (new date, the reason, what the client has to do) moved to the top. The "not X, it's Y" line, the dash and the chatbot opener and closer are gone.

## 2. Social post (post)

**Before** (FAIL)
> Here's the thing: AI can now read your PDFs. 🚀🔥 I tested it, and the results? Mind-blowing. This isn't a tool. It's a superpower. Let that sink in. #AI #productivity #tools

**After** (PASS)
> I gave an AI a 40-page lease and asked when I can leave early.
>
> It found the clause on page 31. It also missed the fee on page 33.
>
> Useful for finding things. Still read the page it points to.

What changed: it starts with what was tested, gives one real result and one real miss, and ends on advice instead of a dramatic closer. No hashtags, no emoji pile.

## 3. Video description (prose)

**Before** (REVIEW)
> In this video, we delve into the vibrant world of home coffee. Join us on a journey of discovery as we showcase three robust methods that serve as a testament to the art of brewing.

**After** (PASS)
> Three ways to make coffee at home, tested side by side: French press, pour-over and a $30 espresso maker. Timings and the amounts we used are in the pinned comment.

What changed: the stock words (delve, vibrant, journey, showcase, testament) became the actual content of the video.

## 4. Voice-over line (script)

**Before** (FAIL)
> At its core, sleep isn't rest — it's maintenance. No phones. No screens. No excuses.

**After** (PASS)
> While you sleep, your brain clears out waste it built up during the day. That's why a bad night feels foggy.

What changed: one concrete fact instead of a slogan. The dash is gone, which also stops text-to-speech voices from making an odd pause.

## 5. Email to a team (prose)

From a test run: a fresh AI followed this skill on the draft, then the writer corrected it once ("I always sign off with 'Cheers' and I say 'folks', not 'team'"), which went into their voice card.

**Before** (FAIL)
> Hi team,
>
> I hope you're doing well! Just circling back on the Q3 onboarding guide. Moving forward, we'll be leveraging a new checklist that streamlines the entire process — from day one to day thirty.
>
> Here's what you need to know: the guide now has 12 steps instead of 19, and the pilot group of 8 new hires finished it in 3 days on average, compared with 5 before. The best part? Zero missed laptop setups.
>
> Please don't hesitate to reach out with any questions.
>
> Thanks,
> Priya

**After** (PASS)
> Hi folks,
>
> From now on, we'll use a new checklist for Q3 onboarding that covers day one through day thirty. The guide now has 12 steps instead of 19.
>
> In the pilot, 8 new hires finished it in 3 days on average, down from 5 before, and none of them missed a laptop setup.
>
> Cheers,
> Priya

What changed: 81 words became 51. All the numbers stayed (Q3, 12 instead of 19 steps, 8 new hires, 3 days instead of 5, no missed laptop setups). The filler went: "I hope you're doing well", "circling back", "Here's what you need to know", "The best part?", "Please don't hesitate". So did "streamlines the entire process", a claim the 12-vs-19 numbers already make. The greeting and sign-off are the writer's own, from the voice card.

