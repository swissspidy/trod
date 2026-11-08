# drag-items (sortable list of 5 names)

RULES
- The FIRST drag ends the episode, right or wrong. There is no submit button. Work out the target slot before you drag.
- Work out the target index (1-5) from the text: "1st/top" = 1, "bottom" = 5 (the last item), "up by one" = current-1, "down by one" = current+1, "Nth position" = N.
- Use `dragxy`, not `drag <id> <id>`. `drag` drops on the target's centre. That worked for upward moves but FAILED (reward -1) for a downward move by one.
- Item boxes are about 24px tall. The observe y is the top of the text, and the box spans roughly y-5 to y+19. Centre x = 83.
- Moving UP: drop on the TOP edge of the target item (target_y + 1).
- Moving DOWN: drop on the BOTTOM part of the target item (target_y + 15).
- Pick up the source from its middle (source_y + 7).

RECIPE (solved 9 in a row)
1. `mw observe` → note the y of <source> and of the item now at <target index>.
2. If target index < source index: `mw dragxy 83 <src_y+7> 83 <tgt_y+1>`
   If target index > source index: `mw dragxy 83 <src_y+7> 83 <tgt_y+15>`
3. Example with y values 63,91,120,149,177: move item 3 to the top: `dragxy 83 127 83 64`; move item 2 to 3rd: `dragxy 83 98 83 135`; move to the bottom: `dragxy 83 <src_y+7> 83 193`.
4. Don't run any other action after the drag; the episode is already over.
