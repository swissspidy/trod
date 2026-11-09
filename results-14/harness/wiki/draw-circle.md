# Draw a circle around the marked point (one drag + Submit)
Tasks like: "Draw a circle centered around the marked point by dragging the mouse. Press submit when done."

## Rules
- `dragxy` draws only ONE straight line. Each new drag wipes the previous one, so only the last stroke counts. Make exactly one drag.
- The marked point is `circle#circ @<x>,<y> 8x8`, and @ is its top-left corner. Its centre is cx=<x>+4, cy=<y>+4.
- The stroke must be an arc-like chord: both ends 35 px from the centre, the line NOT passing near the centre, pointing toward the middle of the page.
- DO NOT draw a diagonal through the centre. Haiku did this every time and got only 0.5. A horizontal or vertical line through the centre scores below 0.
- DO NOT use a 25 px quarter-chord such as (cx+25,cy)→(cx,cy+25), or (cx+30,cy+5)→(cx+5,cy+30). These score 0.9, not 1.
- No screenshot is needed. The observation gives the dot's position. Do not draw several strokes as a polygon.

## Recipe (scored 1.0 in 18 of 18 runs, all quadrants)
1. `mw observe`, then read `circle#circ @<x>,<y>` and the Submit id. Set cx=<x>+4, cy=<y>+4.
2. sx = -1 if cx > 78, else +1. sy = -1 if cy > 107, else +1.
3. Do the drag and Submit in ONE call:
```
mw <<'EOF'
dragxy <cx+34*sx> <cy+9*sy> <cx+9*sx> <cy+34*sy>
click <Submit id>
EOF
```
4. The output says "The episode has ended." Reply DONE.

Worked example of the arithmetic (not a real episode): @60,120 gives cx=64, cy=124, so sx=+1 and sy=-1. The drag is `dragxy 98 115 73 90`.
