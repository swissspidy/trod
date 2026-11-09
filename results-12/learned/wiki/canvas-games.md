# Canvas / game tasks

## Right angle ("Add a third point to create a right angle, then press submit")
- Shown as `circle#init-black`, `circle#init-blue` and `line`. Each click adds a point and there is no undo.
- Use box centres: (x+w/2, y+h/2).
- A click at (cx,cy) puts the new point's centre at (cx+2, cy+2), so click at target − (2,2).
- Pick P with the right angle at P: P lies on the circle with diameter black–blue (check the dot product).
- 92.3° failed (ignored the offset). Aim within 1°, then `click <Submit>`. Right angle at the new point passed 3 of 4; 028 failed at exact 90° with axis-aligned legs (cause unknown): prefer slanted legs.

## Tic-tac-toe (no elements; use clickxy)
- Cell centres: x = 33, 78, 122 and y = 83, 127, 171.
- O may already be on the board. Screenshot after every move.
- Take the centre. Each move, in this order: (1) list X's lines with two X and an empty cell and WIN there; (2) else block O; (3) else fork.
- 009 had a fork, O blocked one line, and X blocked O instead of winning on the other: draw, fail.
- A draw fails. 010–012 won: centre, then the corner opposite O's corner, then a fork.

## Find and click the HOT area (3 of 11 passed overall)
- There are no elements. Any click inside the bordered box (about x 2–158, y 52–178) ends the episode; a click on the yellow band above (80,25) does not.
- No cue was found in any screenshot (037–040); skip looking.
- Ending points: (80,150) passed 2 of 5; centre (80,110–115) 0 of 3; upper-left (25–40,70–75) 0 of 3. It is a guess: click once (e.g. `clickxy 80 150`) and reply DONE.

## Keep the mouse hovered over the colored square (0 of 12 passed)
- `rect#highlight` moves every 1–3 s on a timer. No session ever saw "ended": hovering by hand and the one-Bash chase loop (observe → hover highlight id) both failed.
- Don't burn all 60 actions: hover the highlighted square, chase it for at most ~40 actions, then reply DONE.
