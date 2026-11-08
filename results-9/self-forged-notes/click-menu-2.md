# click-menu-2 notes

RULES
- The target wording changes per episode. Read the task text from `mw reset` / `mw observe` every time; do not reuse a previous episode's target.
- The first click that ends the episode is final. Do not click anything until you know the exact target.
- The target is either a label ("labeled "X"") or an icon ("the item with the <icon> icon"). Icon tasks show no name, so identify the item by its icon.
- For icon tasks, run `mw screenshot shot.png`, then Read it. Crop/enlarge with `python3 -I` (PIL) if the icons are small. Zoom In shows a magnifier with "+", Zoom Out shows a magnifier with "−", Save shows a floppy disk, Next shows ▶|, Prev shows |◀, Play shows ▶, Stop shows ■. Do not guess between two similar icons.
- Clicking "Save" when the task asks for an icon ends the episode with reward -1.
- Do not click Print... (disabled/greyed).
- Playback opens a submenu (Prev, Stop, Play, Next). Hover it with `mw hover <id>` first, then `mw observe` to get the submenu ids, then click the target. Submenu ids change after the hover, so re-observe.

RECIPE (worked 4 of 4)
1. `mw reset`; read the task text.
2. `mw click 1` (Menu). Then `mw observe`.
3. If the target is a top-level label, `mw click <id>`. If it is in Playback, `mw hover 4`, `mw observe`, then `mw click <id>`.
4. For icon tasks, screenshot before step 3 and match the icon.
5. `mw reward` should report 1 (episode ended).
