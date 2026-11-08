# Drag tasks

## Shapes into the black box ("Drag all <circles|rectangles|triangles>…")
- How element names map to shapes:
  - `circle` is a circle
  - `rect` (not #shape-container) is a rectangle or square
  - `polygon` is a triangle
- `drag <shape id> <shape-container id>` for each match, then `click <Submit>`. Passed: 062, 065.
- If no element matches, just Submit with nothing moved.
  - 063 refused to submit and failed.
  - 064 was asked for rectangles but dragged polygons, then submitted. It failed.

## Sortable list / 3x3 grid ("Drag X to the 5th position / bottom / top center / up by one")
- The positions are the slots of the list or grid.
  - Grid "center" is the middle cell (the 5th element).
  - "bottom center" is the 8th element; "top center" is the 2nd.
  - Session 066 dragged to the middle of the whole page and failed.
- Moving UP works with `drag <item> <target slot item>`: 068, 069, 073 passed, and `dragxy` up passed in 074.
- Moving DOWN with `drag <item> <target>` failed every time (070, 071, 072). The drop at the target's exact centre seems to land one slot short.
  - Untested idea: use `dragxy <item centre> <a point past the target's centre in the move direction>`.
  - For a list, that is the target's y + h + 4.
  - For the last slot, aim below the last item.
- The drag itself ends the episode, so plan the drop point before acting.

## Draw a circle around the marked point (058–061, all failed)
- `dragxy` makes one straight stroke, and each new drag replaces the previous one. Nobody drew a circle.
- All four sessions then refused to Submit. That is a certain fail.
- If you cannot do better, leave a stroke and click Submit anyway.
