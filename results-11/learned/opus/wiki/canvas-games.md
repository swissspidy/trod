# Canvas / game tasks

## Right angle ("Add a third point to create a right angle, then press submit")
- Shown as `circle#init-black`, `circle#init-blue` and `line`. Each click adds a point and there is no undo.
- Use box centres: (x+w/2, y+h/2).
- A click at (cx,cy) produced `circle#blue-circle` @cx-1,cy-1 6x6, so its centre is (cx+2, cy+2). Seen in all 4 sessions. So click at target − (2,2).
- Pick the target point P so the angle at one of the three points is 90°, then check with a dot product.
  - For a right angle at P, P lies on the circle whose diameter is black–blue.
  - Prefer long legs.
- Results:
  - 88.0° and 88.7° passed.
  - 92.3° failed (027 aimed at the corner but ignored the +2 offset).
  - 025 put the right angle at black and failed.
- Aim within 1°, then `click <Submit>`.

## Tic-tac-toe (no elements; use clickxy)
- Cell centres: x = 33, 78, 122 and y = 83, 127, 171.
- O may already be on the board. Screenshot after every move.
- Take the centre. Before each move:
  1. Win now if you can.
  2. Otherwise block.
  3. Otherwise make a fork (two threats).
- 011 only blocked and drew, which failed. 005, 010 and 012 won with centre, then a corner, then a fork.

## Find and click the HOT area (035 passed, 037, 039 and 040 failed)
- There are no elements. A click inside the bordered box ends the episode.
- Blind clicks at the box centre (80,110–115) failed three times.
- 035's first click at the yellow band (80,25) did not end the episode, and its second click passed.
- No reliable method was found. Look for hot/cold cues (colour, text) in a screenshot before the one final click.

## Keep the mouse hovered over the colored square (0 of 4 passed)
- `rect#highlight` changes to another square on its own, and the episode never ended after one hover plus DONE.
- Untested idea: loop until "The episode has ended", within the 60-action budget.
  1. `mw observe`
  2. Find the id on the `rect#highlight` line.
  3. `mw hover <id>`
