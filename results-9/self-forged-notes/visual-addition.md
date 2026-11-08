# visual-addition: count blocks, type total, submit

RULES
- Submit (`click <Submit id>`) ENDS the episode immediately. Do not click it until the textbox holds your final answer.
- Submitting an empty textbox ends the episode with reward -1. Always type first.
- `press Enter` does NOT submit. Only clicking the Submit button counts.
- Element ids and positions change per episode (e.g. the "+" moves). Run `mw observe` after `mw reset` and use the ids it prints; never reuse ids from a previous episode.
- The blocks are not elements; you can only count them from the picture. Use `mw screenshot <file.png>` and Read the PNG. Do not guess from the text.

RECIPE (5/5 solved this way)
1. `mw reset`
2. `mw screenshot /tmp/s.png`, then Read it.
3. Count blocks in the left group and the right group separately (they sit in 3-wide grids, rows may be partial). Total = left + right.
4. `mw type <textbox id> <total>`
5. `mw click <Submit id>`
6. `mw reward` -> expect reward 1 (ended).

Example: left 3+2, right 3+3 -> type 11, click Submit -> reward 1.
