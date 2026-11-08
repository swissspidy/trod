RULES
- Clicking Submit ends the episode and scores it. Finish all targets first; verify before Submit.
- Action icons are not in `observe`. Icons sit at x≈25 (Reply) or x≈122 (Share), y = name_y + 49, name_y being the post's `span.name` y.
- Each icon click toggles state. Click each target once; never re-click to check.
- State shows only as colour: Share purple, Reply blue. Hover also tints, so click blank space (`clickxy 300 380`) before judging with `screenshot`.
- Targets: posts whose `span.username` equals the task's @user.
- The feed is clipped to about y 50–210 under a yellow header. Clicks outside that band miss; scroll first.
- `scroll` and `drag` do not move the feed. Don't use them.
- To scroll: `press Tab` focuses Submit and jumps the feed to the bottom; then `PageUp`/`PageDown` move about 134px per press while Submit has focus. Any click drops focus, so Tab again.
- After scrolling, `observe` y values shift (can be negative). Recompute before each click.
- Submit: `click <id>` (id 19 or 31, depends on post count).

RECIPE
1. `observe`; note the posts with username <user> and their name_y.
2. Click each visible target's icon at (<x>, name_y+49), staying in y 50–210.
3. `press Tab`, then PageUp/PageDown until the next target is in band; `observe` for exact y.
4. Click blank space, `screenshot`; confirm all targets coloured, non-targets not.
5. `click <Submit id>`; `reward` should then show 1.
