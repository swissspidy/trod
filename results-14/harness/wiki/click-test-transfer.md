# Click button ONE (two buttons that may overlap)
Tasks like: "Click button ONE."

## Why sessions failed
The two 40x40 buttons are placed at random and can OVERLAP. TWO is drawn ON TOP.
`click <id of ONE>` clicks ONE's centre. If TWO covers that centre, the click hits TWO: reward -1, and the episode still ends.
Never send a blind `mw click 1`. Always run `mw observe` first and check the coordinates.

## Recipe (2 mw calls)
1. `mw observe`. Read `"ONE" @x1,y1` and `"TWO" @x2,y2`. These are top-left corners, and each box is 40x40.
2. Compute dx=|x1-x2| and dy=|y1-y2|.
   - If dx >= 40 OR dy >= 40, they do not overlap: `mw click <id of ONE>`. Done.
   - Otherwise they overlap. Click a point of ONE that TWO does not cover, with `mw clickxy x y`:
     - If dx >= dy (offset is mostly sideways):
       y = y1+20
       x = (x1+x2)/2 if x1 < x2, else (x1+x2+80)/2
     - Else (offset is mostly vertical):
       x = x1+20
       y = (y1+y2)/2 if y1 < y2, else (y1+y2+80)/2
     (Round down. This puts the click in the middle of the strip of ONE that sticks out from under TWO.)
3. The click ends the episode ("The episode has ended."). Reply DONE. Nothing else is needed.

Example with made-up numbers: ONE @50,100, TWO @60,95 → dx=10 and dy=5, so dx >= dy. x1 < x2 gives x=(50+60)/2=55, and y=120 → `mw clickxy 55 120`.

## Don'ts
- Do NOT assume id 1 is safe because it is labelled ONE. Overlap is the only trap.
- Do NOT use the corner of ONE (x1+38, y1+38 etc.). When the offset is tiny, the corner is still under TWO (this failed). Use the strip midpoint formula above.
- Do NOT take screenshots or add extra steps. The task is timed, and observe + one click is enough.
