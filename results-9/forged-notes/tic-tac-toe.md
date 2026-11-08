# tic-tac-toe (mw) — RULES

- `mw observe` lists NO cell elements. Use `mw clickxy <x> <y>` on cell centers (seen identically in 3 episodes):
  columns x = 33 / 78 / 123, rows y = 83 / 127 / 171 (top-left 33,83; center 78,127; bottom-right 123,171).
- Do `mw screenshot s.png` + Read it BEFORE your first move: O sometimes has already moved (2 of 3 episodes).
- O replies instantly after each X click; screenshot after EVERY click to see the board (X = cross, O = ring). Ignore the blue dots in the right panel.
- Completing an X line ends the episode at once with reward 1. No submit button.
- Clicking an occupied cell does nothing (no turn lost) — still, don't rely on it.
- O plays weakly (sometimes misses blocks, sometimes blocks). Each move, in this order: (1) win if X has two in a line with the third empty; (2) block if O has two in a line; (3) prefer a move that makes two X threats at once (fork); (4) else center, then corners.
- A draw/loss presumably ends the episode with no reward (untested) — never play carelessly; check all 8 lines before each click.

## Recipe (worked 3/3)
1. `mw screenshot s.png`, Read it.
2. `mw clickxy 78 127` (center; if O took it, take a corner 33 83).
3. screenshot → take a corner that threatens a line through the center (opposite corner empty), unless you must block.
4. screenshot → win if possible, else block O's two-in-a-line (blocks often create an X fork).
5. Repeat until the winning click; `mw reward` should show 1 (episode ended).
