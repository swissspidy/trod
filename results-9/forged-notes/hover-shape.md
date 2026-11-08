# hover-shape notes

WARNING: in practice I never got reward > 0 and the episode never ended. The harness sets the episode timer to 24h, and this task seems to score only when that timer runs out. Earlier baseline runs also all scored 0.

RULES
- The colored square is the rect whose observe line contains `rect#highlight`. Its @x,y are page coords of the top-left corner. It stays green, and the highlight JUMPS to another rect every ~2-4 s whether or not you hover it.
- Do NOT click, dblclick, press Enter or drag to "finish". None of these ended the episode or changed the reward. There is no submit button.
- Every action counts toward the ~60-action limit, and so does `observe`. Each hover already prints a fresh observation, so read the next highlight id from the hover's output instead of calling observe.
- Hovering the same id again does nothing. Re-hover only when the highlight id changes.
- Hovering a non-highlighted rect did not end the episode either. Still, don't leave the mouse on one.
- Finish with the mouse on the current highlight, then reply DONE. Don't loop until you run out of actions.

RECIPE (best known; it did not score in practice)
1. `mw observe` and find `[<id>] rect#highlight`.
2. `mw hover <id>`. In the printed observation, find the highlight id again.
3. If it changed, `mw hover <new id>`. Repeat for about 20-30 hovers at most, so you stay under the limit.
4. As your last action, hover the current highlight id. Then stop and reply DONE.
