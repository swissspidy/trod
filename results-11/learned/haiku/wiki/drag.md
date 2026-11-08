# Drag tasks: ordered lists, shapes into a box

Ordered list or grid ("Drag Taffy up by one", "Drag X to the 5th position", "to the bottom", "to the top center"):
- `drag <id> <id>` drops the item onto the other item's slot. Before acting, map positions from the listing (rows by @y, columns by @x) and pick the target element that holds the wanted slot.
- Upward drags passed (068, 069, 073, 074). Downward drags failed (070 `drag 5 8`, 071 `drag 4 5`, 072 `drag 3 5`). Untested hypothesis: moving down lands one slot short. Check that before the last drag, since the last drag ends the episode.
- 066 dragged to a guessed centre with `dragxy` and failed. Prefer ids.

Shapes into the black box ("Drag all rectangles into the black box"):
- Match by tag and fill: `rect` is a rectangle, `polygon` a triangle, `circle` a circle. Drag each matching id onto the box (`rect#shape-container`): `drag 1 5`, `drag 4 5` (065 passed).
- 064 dragged `polygon` elements for a "rectangles" task and failed. 063 found no triangles, did not Submit, and failed. If no element matches, screenshot to check the list, then still Submit your best attempt.
- After the drags, `click <Submit>` (062, 065).
