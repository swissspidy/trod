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

## Sortable list / 3x3 grid ("Drag X to the 5th position / top right / center / up by one")
- The positions are the slots of the list or grid, in reading order. Grid "center" is the 5th item, "top right" the 3rd, "center right" the 6th, "bottom center" the 8th. Never aim at the middle of the page.
- The drag itself ends the episode, so plan the drop point first.
- Straight up or left: `drag <item> <target item>` passed (065, 066, 070).
- Any move down or right: `dragxy <item centre> <point past the target's centre in the direction of travel>`. A drop on the exact centre lands one slot short.
  - List, down: passed with `dragxy` to the target's y+h+4 (067); for the last slot aim below the last item.
  - Grid, down-right: `dragxy 27 77 119 126` (target centre 119,110) passed in 072.
  - Grid, up-right: plain `drag 8 3` failed (069). Aim past the centre to the right as well.
  - Grid "down by one": `dragxy` one row down (to 9px below the target centre) failed in 071. "By one" may mean the next slot in reading order; no session confirmed either reading.

## Draw a circle around the marked point
- `dragxy` makes one straight stroke, and each new drag replaces the previous one. A real circle cannot be drawn.
- Do one stroke around the point, then `click <Submit>`. That passed in 057, 058 and 059. 060 refused to submit and failed.
