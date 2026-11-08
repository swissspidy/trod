# click-test-2 notes

Task: "Click button <LABEL>." Two 40x40 buttons, labelled "ONE" and "TWO", at random positions. They may overlap or sit close together.

RULES
- Any button click ends the episode at once. Clicking the wrong button gives reward -1 with no retry, so get it right the first time.
- Pick the element by its quoted label text in `mw observe`, e.g. `"ONE"`. Don't go by the id number, the position or the order in the list. Ids and positions change every episode.
- Use `mw click <id>`, not clickxy. With clickxy the buttons can overlap, and you may hit the wrong one.
- You don't need a submit, hover or wait. One click on the right button gives reward 1.
- Don't press keys or click anything else before the target. Every button counts as a final action.

RECIPE (worked 4 of 4 times in a row)
1. `mw observe` and read the task "Click button <LABEL>."
2. Find the line `[<id>] button... "<LABEL>"`, matching the label exactly.
3. `mw click <id>`. Done.
