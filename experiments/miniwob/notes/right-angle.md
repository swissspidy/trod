# right-angle notes (solved 4/4 this way)

RULES
- Clicking Submit ends the episode. Before you click it, place the third point.
- The right angle goes at the BLUE point (circle#init-blue), not the black one. The third point P must make blue→P perpendicular to black→blue.
- Get the centers from the circles' bounding boxes: center = (x + w/2, y + h/2). For `@17,107 7x7` that is (20.5,110.5). Don't use the `line` box.
- Place the point with `clickxy`. The drawing area is about x 0–160, y 50–170. Don't place a point near the Submit button (y≈178–209) or the yellow task bar (y<50).
- Clicking the canvas again MOVES the third point; it does not add a fourth. So you can fix a bad point before you submit.
- Put P far from blue (30–60 px). With small pixel rounding, a longer arm keeps the angle closer to 90°. A reward around 0.97–0.99 counts as solved.
- No drag, hover or screenshot needed.

RECIPE
1. Read [black] @<bx>,<by> <w>x<h> and [blue] @<ux>,<uy> <w>x<h>. Compute the centers B and U.
2. Compute d = U − B = (dx, dy). Take the perpendicular as (−dy, dx) or (dy, −dx). Pick whichever keeps P = U + t·perp inside x 5–155, y 55–170 (t ≈ 1, or scale it so the arm is 30–60 px).
3. Run `clickxy <Px> <Py>`. The output should show a new circle#blue-circle and a line from blue to it.
4. Run `click <Submit id>`.

Example: B=(22.5,71.5), U=(25.5,103.5), d=(3,32) gives perp (32,−3)×2, so P=(89,97). Then submit, reward 0.97.
