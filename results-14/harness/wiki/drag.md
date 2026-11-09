# Drag tasks

## Shapes into the black box ("Drag all <circles|rectangles|triangles>…")
- `circle` = circle; `rect` (not #shape-container) = rectangle/square; `polygon` = triangle.
- `drag <shape id> <shape-container id>` for each match, then `click <Submit>` (passed 061–064).
- If nothing matches, Submit with nothing moved (refusing failed). Dragging the wrong kind failed.

## Sortable list / 3x3 grid ("Drag X to the 5th position / top right / center / up by one")
- Positions are slots in reading order. Grid "center" = 5th, "top right" = 3rd, "center right" = 6th, "bottom center" = 8th.
- The drag itself ends the episode, so plan the drop point first.
- Plain `drag <item> <target item>` passes only for straight up in the same column/list (066, 069 `9→6`, 071 `7→4`).
- Every other move: `dragxy <item centre> <point past the target centre in the direction of travel>`; a centre drop lands one slot short.
  - Plain `drag` on a move that changes row AND column failed 3 of 3 (up-right 8→3; up-left 6→2, 8→1).
  - List down: target y+h+4 passed (067). Grid down-right: `dragxy 27 77 119 126` (target centre 119,110) passed.
  - Up-left: aim at target centre − (10,8) (untested). Grid "down by one" to 9px below the target failed once.

## Draw a circle around the marked point
- `dragxy` makes one straight stroke, and each new drag replaces the previous one. A real circle cannot be drawn.
- The stroke must be DIAGONAL and centred on the point (centre cx,cy of `circle#circ`): `dragxy <cx-20> <cy-19> <cx+20> <cy+19>`. Passed 057, 059.
- After the drag, the observation must list a new `path` element. A horizontal (058) or vertical (060) stroke left no `path`, and submitting it failed. If no `path` appears, redo the drag diagonally.
- Then `click <Submit>`; never refuse.
