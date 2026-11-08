# tic-tac-toe with mw (you are X)

- `observe` prints only the task text; it lists NO element ids. `click <id>` fails ("no element [1]"). Don't use ids.
- Play by coordinates: `clickxy <x> <y>`. Cell centers (verified): columns x=33,78,123; rows y=83,127,171.
  - TL 33 83 | TM 78 83 | TR 123 83
  - ML 33 127 | MC 78 127 | MR 123 127
  - BL 33 171 | BM 78 171 | BR 123 171
- Read the board with `mw screenshot /tmp/x.png` then Read the png. Take a screenshot after every move: O replies immediately, and the board is only visible there.
- O may already have a piece on the board when the episode starts (seen 2 of 3 times, e.g. O at BM or TR+MR). Read the screenshot before the first click; don't assume an empty board.
- The episode ends on the winning click ("The episode has ended"); `mw reward` then shows reward 1. No submit button needed.
- Each turn: (1) if you can complete three X, click it; (2) else if O has two in a line, block it; (3) else take the center, else a corner; prefer a move that creates two threats (fork). Blocking O's threat can itself create your double threat.
- Don't `mw reset` until the episode has ended (reward ≠ 0 or "ended"), or you lose the current one.

Recipe (worked 3/3): empty or O-first board → center (78 127) if free; block any O two-in-a-row; take a corner that makes an X two-in-a-row (<corner>, e.g. 33 83 or 123 171 opposite O's corner); when O blocks, complete your line on the next free cell.
