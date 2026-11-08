# social-media-some notes

RULES
- After every `mw reset`, read line 1 of `mw observe`: it gives the action (Share/Reply/Like), the count N and the @author. Count the matching posts yourself.
- Submit with nothing done ENDS the episode with reward -1. Press Submit only after exactly N matching posts show the action.
- Target the first N posts by that @author in feed order. Every success used this rule. Don't touch other posts; an earlier stray click led to -1.
- Action icons are NOT in `observe`. Run `mw screenshot f.png` and Read it. Icon x: reply 25, retweet 58, like (heart) 90, share 122. Rows are 62px apart.
- Click icons with `clickxy <x> <y>` using screenshot coordinates. Activated icons turn colored (share purple, reply blue, like red). Confirm with a screenshot.
- Feed scrolling: `clickxy` on a post's body text, then `press ArrowDown` / `ArrowUp` (~40px per press). `scroll <id>`, `Home` and `End` do nothing.
- Element ids change between observes. Run `mw observe` right before `click <submitId>`; `click` works even offscreen.
- Success: `mw reward` shows "The episode has ended", reward 1.

RECIPE (worked 4 of 5 tries)
1. `mw reset`; `mw observe` (note task, N, @author, Submit id).
2. `mw screenshot s.png`; Read it.
3. For each of the first N matching posts: scroll so the post's icon row is visible (ArrowDown after clicking body text); `clickxy <icon x> <row y>`; screenshot to confirm color.
4. `mw observe`; `click <submitId>`; `mw reward` → reward 1.
