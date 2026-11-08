# Buttons, menus, checkboxes

## "Click button ONE" / "ONE, then TWO"
- Before clicking, compare the @x,y wxh boxes. If TWO's box covers ONE's centre, `click 1` hits TWO and fails.
  - Then use `clickxy` on a part of ONE that TWO does not cover.
- Otherwise `click 1`, then `click 2`.

## "Click button ONE, wait N seconds, then click button TWO"
- The time window is tight. Separate tool calls (click, then `sleep N`, then click, each waiting for the last) failed in 118. The passes sent `mw click 1` and `sleep N` in parallel in one message, then `mw click 2` right away.
- Best: one Bash call: `mw click 1; sleep <N>; mw click 2` (chained short sleeps work).

## Nested menu ("Select A>B>C")
- Clicking a parent item is final: it ended 101 and 103 as failures.
- `hover <A's item id>`. The submenu often is NOT in hover's own output (101, 104). Run `mw observe` (or a screenshot) next; the submenu's `ul.ui-front` and its items then appear (104 passed this way).
- Repeat hover + observe for each level, then `click <leaf id>` only for the last name.
- "Select X" with a single name: `click <X>` (passed).

## "Click Menu, then the item with the <icon>"
1. `click <Menu>`, then screenshot and zoom the task's icon and the menu.
2. Top-level icons: Save = floppy disk, Print, Zoom In/Out = magnifiers. Playback has a submenu: Prev `|◄`, Stop (solid black square), Play `►`, Next `►|`.
3. Always open Playback (`hover` or `click` its item; clicking Playback did not end 107) and observe/screenshot before choosing a top-level item.
   - 105 matched a solid black square to Save and failed; the square is Stop (108 passed).
4. `click <matching item>`.

## "Select words similar to <w1, w2…> and click Submit"
- Tick the checkbox `input` next to each label that is a synonym of any target word. A literal repeat of a target word also counts.
- Then `click <Submit>`.
- If no word fits, Submit with nothing ticked (passed). Asking the user instead failed.
