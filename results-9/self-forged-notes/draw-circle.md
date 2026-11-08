# draw-circle: "Draw a circle centered around the marked point by dragging the mouse. Press submit when done."

RULES
- `click <submit id>` ends the episode. Draw the ring first.
- Submitting with nothing drawn gives -1. One straight drag gives -0.25.
- Each `dragxy` is a straight line, so one drag can't make a circle. Draw 8 consecutive drags. They accumulate; the screen shows only the last, so don't judge by the picture.
- Radius about 38 px. Measured: R=12 → -0.25, R=25 → 0.25, R=30 → 0.25, R=38 → 0.5 (5 times), R=44 → 0.45.
- The ring may leave the dotted canvas; R=38 still gave 0.5. Don't shrink R to fit.
- Center = `@x,y` on the `circle#circ` line. Grep `circle#circ`, not `circ` (the task text contains "circle").
- Bare `mw` reads stdin and hangs. Use `mw observe </dev/null`.
- Each `reset` moves the marked point. Observe after every reset.

RECIPE (0.5 in 5 of 5 tries)
1. `mw reset`, then `mw observe </dev/null`. Note the center `(X,Y)` from `circle#circ`, and the Submit id from `button "Submit"`.
2. Make 9 points at radius 38: `(X + 38cos(45k°), Y + 38sin(45k°))` for k = 0..8 (last = first). Round to integers.
3. Run `mw dragxy x_k y_k x_{k+1} y_{k+1}` for k = 0..7, one command each.
4. `mw click <submit id>`, then `mw reward` → 0.5 means solved.
