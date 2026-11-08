# drag-items-grid notes

RULES
- Every drag/dragxy is FINAL: the episode ends at once, so no submit is needed and no second try exists. Run `mw observe` in its own call and read the task before any drag (two blind drags hit the wrong task and scored -1).
- Grid = 3x3 labels at x=10/56/102, y=60/106/152 (label top-left). Cell centre = label +17,+4 (row1 col1 = 27,64; row2 col2 = 73,110).
- Relative tasks ("up/right/down/left by one"): `drag <src> <neighbour id>` worked for up (7/7) and right (2/2). Do not use it for left (0/2) or down (0/2).
- Absolute tasks: do NOT drop on an occupied cell (1 of 8 worked). Drop on the empty margin of the widget with `dragxy <src centre> <point>`.
  Points that worked (from sources in row 1-2, col 1-2, 10 of 12 tries): top-right 150 62; centre-right 150 125; bottom-right 150 200; bottom-centre 80 200; top-centre 80 53.
- Sources in column 3 (0/6) or the bottom row (0/6) failed with dragxy, even to right-side points. Relative `drag` from them still worked (up moves).
- Left-side targets (top-left, centre-left, bottom-left) failed in every try (0/8); no working recipe found.

RECIPE
1. `mw reset`, then `mw observe` (read the task, note the target and the source id).
2. Relative task: `mw drag <src id> <neighbour id>`.
3. Absolute task to a working point from row 1-2, col 1-2: `mw dragxy <src x> <src y> <point x> <point y>`.
4. `mw reward` should print reward 1.
