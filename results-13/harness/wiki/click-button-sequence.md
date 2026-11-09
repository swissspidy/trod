# Click two buttons in order (ONE then TWO)
Tasks like: "Click button ONE, then click button TWO."

Every button is 40x40. The list gives `@x,y` for the top-left corner. TWO is drawn ON TOP of ONE. When the two boxes overlap, `click 1` presses TWO first, and the reward is -1.

## Step 1: check for overlap (no extra action needed)
Read `[1] ONE @x1,y1` and `[2] TWO @x2,y2` from the task observation.
dx = |x1-x2|, dy = |y1-y2|.
They overlap if dx < 40 AND dy < 40.

## Step 2a: no overlap (dx >= 40 or dy >= 40)
Send both clicks in ONE call:
```
mw <<'EOF'
click 1
click 2
EOF
```

## Step 2b: overlap. Click the uncovered part of ONE with clickxy
- If dy >= dx: x = x1+20.
  y = (y1+y2)/2 if y1 < y2, otherwise (y1+y2)/2 + 40.
- Otherwise: y = y1+20.
  x = (x1+x2)/2 if x1 < x2, otherwise (x1+x2)/2 + 40.
```
mw <<'EOF'
clickxy <x> <y>
click 2
EOF
```
Example of the arithmetic: ONE @A,B and TWO @A-3,B+15 give dy >= dx, so clickxy A+20 (B+B+15)/2.

The output must end with "The episode has ended." Then reply DONE.

## Do NOT
- Do not run `click 1` when the boxes overlap. That is how a past session failed.
- Do not split the clicks across separate Bash calls, and do not add `sleep`/`observe` between them. Nothing changes on screen after ONE, so there is nothing to wait for.
- Do not click TWO before ONE.
