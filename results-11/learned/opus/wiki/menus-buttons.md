# Buttons, menus, checkboxes

## "Click button ONE" / "ONE, then TWO"
- Before clicking, compare the @x,y wxh boxes. If TWO's box overlaps ONE's centre, `click 1` hits TWO and fails.
  - This happened in 093, 098 and 114: ONE @83,120 40x40 and TWO @102,131 40x40.
  - Then use `clickxy` on a part of ONE that TWO does not cover, e.g. ONE's x+5, y+5.
- Otherwise run `click 1`, then `click 2` as a separate call.
- "wait N seconds": `click 1`, then `sleep N` in its own Bash call, then `click 2` (passed in 117 and 119).

## Nested menu ("Select A>B>C")
- Clicking a parent item is final: it ended 105 and 106 as failures.
- `hover <A's item id>`. The submenu items then appear in the observation, so repeat for each level.
- `click <leaf id>` only for the last name.
- "Select X" with a single name: `click <X>` (passed).

## "Click Menu, then the item with the <icon>"
1. `click <Menu>`
2. Screenshot and Read it.
3. If no top-level icon matches, `hover <Playback item>` (not the `ul`) and screenshot the submenu: Prev, Stop, Play, Next.
4. `click <matching item>`.
- 101 found `|◄` as Prev this way.
- 102 hovered the `ul` (no submenu opened), then clicked the parent and failed.

## "Select words similar to <w1, w2…> and click Submit"
- Tick the checkbox `input` next to each label that is a synonym of any target word. A literal repeat of a target word also counts: 110 ticked "adore" and "murder" and passed.
- Then `click <Submit>`.
- If no word fits, Submit with nothing ticked (passed in 112). Asking the user instead failed 109.
