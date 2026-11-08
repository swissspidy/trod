# drag-items notes (mw)

RULES
- Each episode is one shot: the first completing drag ends it. Reward 1 = solved, -1 = wrong.
- `mw reset` gives a NEW task and layout. Run reset alone, read the "Task:" line, then act in a separate call. Don't reuse a previous target (lost 4 episodes this way).
- "Nth position": 1 = top, 5 = bottom. "up/down by one" is relative. "to the top/bottom" = 1st/5th.
- Target = the item whose text matches the name, using ids from the latest `observe`.
- No submit button: the drag is the final action.
- Dropping on an item's CENTER with `drag <from> <to>` inserts BEFORE it. Use this for moving UP: `drag 3 1`, `drag 5 3`, `drag 3 2` all solved.
- Moving DOWN with `drag` onto the target's center FAILS (-1), both for down-by-one and for "bottom".
- To move DOWN, drop in the LOWER HALF of the item at the destination position: `dragxy 83 <from_y> 83 <dest_y+7>`. Solved "to 3rd" (`dragxy 83 70 83 135`) and "to bottom" (`dragxy 83 98 83 192`).
- Don't drag onto a wrong item to test; it ends the episode.

RECIPE
1. `mw reset`; read Task and the list.
2. Find the name's id <F> and destination index <T>.
3. T < F: `mw drag <F> <T>`.
4. T > F: `mw dragxy 83 <F_y> 83 <T_y+7>`, where T_y is the observed y of item T (for bottom, use item 5).
5. `mw reward` should show 1.
