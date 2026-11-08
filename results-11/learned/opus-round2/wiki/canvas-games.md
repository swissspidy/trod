# Canvas / game tasks

## Right angle ("Add a third point to create a right angle, then press submit")
- Shown as `circle#init-black`, `circle#init-blue` and `line`. Each click adds a point and there is no undo.
- Use box centres: (x+w/2, y+h/2).
- A click at (cx,cy) puts the new point's centre at (cx+2, cy+2), so click at target − (2,2).
- Pick P so one angle is 90° (check with a dot product; for a right angle at P, P lies on the circle with diameter black–blue). Prefer long legs.
- 88.0° and 88.7° passed; 92.3° failed (ignored the +2 offset). Aim within 1°, then `click <Submit>`.

## Tic-tac-toe (no elements; use clickxy)
- Cell centres: x = 33, 78, 122 and y = 83, 127, 171.
- O may already be on the board. Screenshot after every move.
- Take the centre. Each move: win now, else block, else make a fork (two threats).
- A draw fails (009, 011). 010–012 won with centre, then a corner, then a fork.
- 009: after X centre and O corner, X took an adjacent corner and was forced to block every move. Prefer moves that make two lines at once; play the opposite corner to O when no fork exists yet.

## Find and click the HOT area (2 of 7 passed)
- There are no elements. Any click inside the bordered box (about x 2–158, y 52–178) ends the episode; a click on the yellow band above (80,25) does not.
- Failed ending points: centre (80,110–115) ×3, upper-left (25–40,70–75) ×3. Passed: (80,150) once.
- The hot spot seems random. Before the one final click, take a screenshot after a harmless click at (80,25) and look for any colour/text cue. Without a cue, pick one point and click once.

## Keep the mouse hovered over the colored square (0 of 8 passed)
- `rect#highlight` jumps to another square every second or so, and the observation after `hover` is often already stale. Hovering by hand for 45–84 calls never ended the episode.
- Untested idea: follow it in ONE Bash loop to cut the delay, within the budget:
  `for i in $(seq 25); do id=$(mw observe | grep -o '^\[[0-9]*\] rect#highlight' | tr -dc 0-9); mw hover $id | grep -q 'episode has ended' && break; done`
