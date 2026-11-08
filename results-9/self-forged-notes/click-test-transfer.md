# click-test-transfer: notes

Task text: "Click button ONE." Solved = reward 1 (4 of 4 episodes).

RULES
- Any click on the wrong button ends the episode with reward -1. Only click the button whose label is exactly "ONE".
- The episode ends on the first click. There is no submit step, and it is not needed.
- Element ids are not fixed across episodes. Run `mw observe` after every `mw reset` and read the id from the line whose label is "ONE" (observed: id 1 = "ONE", id 2 = "TWO"). Do not reuse a previous episode's coordinates.
- Positions (@x,y) change every episode and the ONE and TWO buttons can overlap. Click by id with `mw click <id>`, not with `clickxy`.
- Do not hover, drag, or type first. Nothing else is needed.
- `mw screenshot` may show a stale page from a previous task right after a reset. Trust `mw observe` for the current labels, and re-take the screenshot if the picture looks wrong.
- Check the result with `mw reward`. It should print reward 1 and "episode ended".

RECIPE
1. `mw reset`
2. `mw observe` and find the id of the element labeled "ONE": <id_ONE>
3. `mw click <id_ONE>`
4. `mw reward` -> reward 1 (ended)
