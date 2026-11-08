# drag-items-grid notes

The grid is 3x3 and holds 9 items (index 0-8, row-major). The `@x,y` in observe is the top-left corner of the item's small text label. The item's box is about 40x40 and starts at about (x-3, y-3), so its center is about (x+17, y+17).

RULES
- Any drag ends the episode, right or wrong. You get one drag.
- Do NOT use `mw drag <id> <id>`, and do NOT drop exactly on the target's center. Both scored -1. The grid is a sortable list: the dragged item is taken out and put back in, and the others shift.
- Use `dragxy`. Start at the center of the source box. Drop past the target's center, in the direction you are moving:
  - Moving forward (target index > source index): drop near the target's bottom-right, about (x+38, y+30).
  - Moving backward (target index < source index): drop near the target's top-left, about (x+2, y+2).
- Find the target from the task text on the 3x3 layout: top/center/bottom = row, left/center/right = column. "up/down by one" = same column, row ±1. "left/right by one" = same row, column ±1 (not tested). The target box is the item currently in that slot.

RECIPE (4 of 4 solved this way, in a row)
1. `mw observe`. Find the source at (sx,sy) and the item currently in the target slot at (tx,ty).
2. If target index > source index: `mw dragxy <sx+17> <sy+17> <tx+38> <ty+30>`
   Otherwise: `mw dragxy <sx+17> <sy+17> <tx+2> <ty+2>`
3. Done. The episode ends after the drag. No submit is needed.
