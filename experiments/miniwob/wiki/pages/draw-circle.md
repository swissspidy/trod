# draw-circle notes

RULES
- Clicking Submit ends the episode. Draw first: submitting with nothing drawn scores -1.
- `dragxy` draws only a straight 12-step line. No action keeps the mouse button held between moves, so you cannot draw a real curve.
- Every new drag wipes the previous stroke and only the LAST stroke is scored. Do not draw a polygon from several drags. Make exactly ONE drag.
- The marked point is `circle#circ @x,y 8x8`, where @ is its top-left corner. Its center is cx=x+4, cy=y+4.
- A horizontal or vertical line through the center fails (-0.25), and so does a very short stroke.
- What passes: a diagonal chord across one quarter of a circle of radius about 25 around the center, from (cx±25, cy) to (cx, cy±25). It scored 0.9 in all 4 quadrants, 8 for 8. A diagonal through the center (cx-15,cy-15 → cx+15,cy+15) scores only about 0.7.
- Keep the whole stroke inside the drawing box (about x 2..154, y 52..163). Strokes that reach the edge score lower or fail. Point the chord toward the middle of the box.
- Click Submit by its id (`click <id>`), not by coordinates.

RECIPE (worked 8/8 in a row)
1. `mw observe`, then read `circle#circ @<x>,<y>`. Set cx=<x>+4 and cy=<y>+4.
2. dx = -25 if cx > 78, else +25. dy = -25 if cy > 107, else +25.
3. `mw dragxy <cx+dx> <cy> <cx> <cy+dy>` (one drag only)
4. `mw click <submit id>`
