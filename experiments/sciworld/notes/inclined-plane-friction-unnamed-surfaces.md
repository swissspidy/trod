# Inclined plane friction (unnamed surfaces) – notes

Task: two inclined planes, "unknown material X" and "unknown material Y" (seen: C and H). Find
the one with the MOST or LEAST friction (read the task wording carefully), then `focus on` it.
**Focus ends the task immediately, so a wrong focus can't be undone.** Focus on nothing else.

## BUDGET: about 100 actions. Bad commands still use up actions.
The gold runs watched the block slide all the way down (~175 actions); in a live run with
the 100-action limit that would fail. You can compare speeds in a few actions.

## Where things are
- Planes, a block (wood block / steel block / brick / ...), and a stopwatch are in the **workshop**.
- You start in a random room (seen: hallway, art studio, kitchen). The workshop door is in the
  **hallway**. If you're not in the hallway: `open door to hallway`, `go to hallway`, then
  `open door to workshop`, `go to workshop`. "open door to workshop" fails from the kitchen
  with "No known action matches that input." Use `go to <room>`, not `go <room>`.
- `look around` in the workshop shows the block's exact name. Typing just `block` also works if the name contains "block".

## Exact phrasings (checked in a live run)
- Plane names are lowercase: `inclined plane with a unknown material c surface`
  (the grammar is "a unknown"; keep it that way).
- `move <block> to inclined plane with a unknown material c surface`
  -> "You move the brick to the inclined plane."
- `look at inclined plane with a unknown material c surface`
  -> "...with: a brick approximately 4% down the plane" (or "at the top/bottom of the plane").
  Each action is one time tick, so the % change per look gives the speed.
- Stopwatch (optional): `pick up stopwatch`, `activate stopwatch in inventory`,
  `deactivate stopwatch in inventory`, `examine stopwatch in inventory`.

## Fast procedure (~15 actions)
1. Walk to the workshop (see above).
2. `move <block> to inclined plane with a unknown material <x> surface`
3. `look at ...<x>...` 2-3 times and note the % each time.
4. `move <block> to inclined plane with a unknown material <y> surface` (the block comes off plane x)
5. `look at ...<y>...` 2-3 times.
6. Faster slide (bigger % gain per look) = LESS friction. Slower = MORE friction.
   Live example: C went 4%->8% per look, H went top->1%, so H has more friction.
   (Gold: C reached the bottom in 24 ticks, H took 142.) Materials and the answer may differ in
   your variation, so measure it. The difference is usually large.
7. `focus on inclined plane with a unknown material <answer> surface`

Safety: the gold runs also picked up and activated the stopwatch before measuring. If budget
allows, do `pick up stopwatch` + `activate stopwatch in inventory` (2 actions) in case the
scorer rewards it. Moving the block onto BOTH planes is probably a scored step, so test
both planes even if the first one looks obvious.
