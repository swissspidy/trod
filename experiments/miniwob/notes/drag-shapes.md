# drag-shapes NOTES

RULES
- Clicking Submit ends the episode. Do all drags first, then click Submit once.
- Shape names map to element tags: "circles" = `circle`, "triangles" = `polygon`,
  "rectangles"/"squares" = `rect` with a fill colour (17x17). The black box is
  `rect#shape-container fill="none"` (80x45). Don't drag the box itself.
- Colour doesn't matter. Move EVERY shape of the asked type, whatever its colour.
- Never move a shape of another type into the box: one extra shape gives reward -1.
- If no shape of the asked type exists (common, e.g. no rect), just click Submit
  with the box empty. That scored 1.
- `drag <shape_id> <box_id>` works every time. It drops the shape at the box
  centre, and shapes stacking on top of each other there is fine.
- After each drag the new state is printed: check that the shape's @x,y now lies
  inside the box (box @x,y is its top-left corner, plus 80x45).
- A wrong shape in the box can be fixed: `dragxy <cx> <cy> <x> <y>` from its
  centre (@x+8, @y+8) to an empty spot outside the box, e.g. 20 160. Then submit.
- No hover, timing or typing is needed. Coordinates in observations are the
  top-left corner of each element.

RECIPE (scored 1 in 6 of 6 episodes that followed it)
1. Read the task type <T> and list the ids whose tag matches <T> (circle/polygon/rect,
   not the container).
2. For each such <id>: `mw drag <id> <container_id>`.
3. Check the printed positions (no extra shapes in the box), then `mw click <submit_id>`.
