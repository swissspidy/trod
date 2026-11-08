# Drag, draw and geometry

## Drag shapes into the black box
- `drag <shape id> <rect#shape-container id>` works. Several drags can go in one heredoc. Shape names: `polygon` = triangle, `rect` = square/rectangle, `circle` = circle.
- Move only the requested kind. Check the new positions in the listing (they should fall inside the box), then `click <Submit id>`.
- If no shape of the requested kind exists, still click Submit. Not submitting is a fail.

## Drag items in a grid or list ("Drag Pru to the 5th position", "to the top center", "up by one")
- `drag <item id> <id of the item now in the target slot>` ends the episode immediately, so work out the target slot first:
  - grid: ids 1-9 are row-major, so top center = 2, center = 5, bottom center = 8;
  - list: nth position = the nth item; "up by one" = the item just above.

## Draw a circle around the marked point
- `dragxy` draws one straight stroke, and each new drag **replaces** the previous one. No session managed to draw a circle, and all four ended without Submit (a sure fail). Make one best-effort stroke and **click Submit anyway**.

## Add a third point to make a right angle
- Each `clickxy` adds a point and can't be undone. Click **once**.
- Compute the point exactly first. Take P on the line through one endpoint, perpendicular to the segment, so that (P-A)·(B-A)=0. Use the circle centres (x+3, y+3 of the listed 7x7 circles) and keep P inside the canvas.
- Then click Submit.
