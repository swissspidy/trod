# inclined-plane-determine-angle: notes

Task: say which of two inclined planes (e.g. "C, B") is the **steepest** or the **shallowest**, then `focus on inclined plane <x>`. READ THE TASK: does it ask for steepest or shallowest? `focus` ends the task, so a wrong focus fails it. Focus once, at the end.

## Where things are
- The planes, a block object and a stopwatch are all in the **workshop**. You may start somewhere else (hallway, art studio, kitchen...). The workshop opens off the **hallway**: `open door to hallway`, `go to hallway`, `open door to workshop`, `go to workshop`. You can't go to a room that isn't adjacent ("No known action matches").
- Run `look around` in the workshop first. The thing you slide **varies**: "wood block", "steel block", "brick", etc. Use the name exactly as shown. When it was a brick, `move block to ...` FAILED, but `move brick to inclined plane b` worked. A failed command still uses up one of your actions.
- Planes are named `inclined plane b` / `inclined plane c` (lowercase works). Use the letters the task gives.

## Physics
Every action, `look` included, moves the game forward one tick. A steeper plane makes the object slide faster: it gets a higher % down the plane per tick and reaches the bottom in fewer ticks. In the live run, after the same `move`, `wait`, `look` sequence, B showed 56% and C showed 59%, so C was steeper and B was shallower. The difference can be small (about 4.7 vs 5.0 %/tick, or 22 vs 21 ticks to the bottom), so compare the two planes **using exactly the same sequence of actions**.

## Fast procedure (tested live, ~10 actions)
1. Walk to the workshop, then `look around` to get the object's name <obj>.
2. `move <obj> to inclined plane b`, then `wait`, then `look at inclined plane b` and note the %. (`wait` = 10 ticks, `wait1` = 1.)
3. `move <obj> to inclined plane c`, then `wait`, then `look at inclined plane c` and note the %. `move` resets the object to the top of the new plane.
4. Higher % = steeper. Lower % = shallower. If the object already reads "at the bottom", or the two % are equal, redo both planes with fewer ticks: use `look` repeatedly (1 tick each) instead of `wait`.
5. `focus on inclined plane <answer>`.

## Gold (expert) method, also fine (~55 actions, well under the 100-action limit)
`pick up stopwatch` → `move <obj> to inclined plane b` → `activate stopwatch in inventory` → repeat `look at inclined plane b` until it reads "at the bottom of the plane" → `deactivate stopwatch in inventory` → `examine stopwatch in inventory` ("The time reads N ticks"). Do the same for plane c. Fewer ticks = steeper. Then focus. The gold runs used the stopwatch but scored only for the final focus. It is unclear whether the stopwatch is required for the score. To be safe, pick it up and activate it (2 extra actions).

## Pitfalls
- Assuming the object is a "block". Check its name first.
- Mixing up steepest and shallowest.
- Comparing % readings taken after different numbers of actions.
