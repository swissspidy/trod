# drag-shapes notes

RULES
- The task names one kind: "circles", "triangles" or "rectangles". Targets are only that kind: `circle` = circle, `polygon` = triangle, `rect` = rectangle (not the box). Ignore colour.
- The black box is `rect#shape-container` (fill none). It is never a target. Read its id from `mw observe`; ids change per episode.
- Drag each target by id: `drag <target-id> <box-id>`. Run `mw observe` after each drag to confirm it sits inside the box.
- Do not drag non-target shapes into the box. Submitting with a non-target inside gave reward -1 (episode ended).
- Do not use `dragxy` on overlapping shapes: it grabs the topmost one, which moved the wrong shape. Drag by id.
- Shapes dropped in the box stack at one spot; that is fine.
- Reward stays 0 until Submit is clicked, and that click ends the episode. Check `mw reward` (0, running) before clicking.
- Submit is `click <submit-id>` (button "Submit").
- If no target kind is present (only the box), clicking Submit with nothing dragged scored 1.
- `mw reset` starts a new episode.

RECIPE (worked 3/3)
1. `mw reset`; `mw observe`; note the kind, `<box-id>`, `<submit-id>`.
2. For each target `<t>`: `mw drag <t> <box-id>`; `mw observe`.
3. `mw reward` (expect 0).
4. `mw click <submit-id>`; `mw reward` (expect 1).
