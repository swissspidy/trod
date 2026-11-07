# inclined-plane-friction-named-surfaces: notes

Task: "which of the two inclined planes (<A>, <B>) has the MOST (or LEAST) friction, then focus on it". MOST and LEAST both occur. Surface names vary (seen: paper, cloth).

## Where things are
- Everything is in the **workshop**: "an inclined plane with a <A> surface", "an inclined plane with a <B> surface", a block object, and a stopwatch. The block can be a wood block, steel block, brick, etc., so `look around` and use whatever it is called.
- You start in a random room (hallway, art studio, kitchen...). All doors start closed. The workshop opens off the **hallway**, so if you are not in the hallway, go there first:
  `open door to hallway` / `go to hallway` / `open door to workshop` / `go to workshop`
- Invalid commands still use up an action. For example, `open door to workshop` from the kitchen gives "No known action matches", because a door only exists in the room it connects.

## Physics / rule
A plane with MORE friction makes the block slide SLOWER: fewer % per tick, and more ticks to reach the bottom. LESS friction means faster. In the gold runs, paper took 18 ticks (about 5.6%/tick) and cloth took 21 ticks (about 5%/tick), so cloth had more friction.
Each action is 1 tick, and `look at` both advances time and shows the block's position.

## Fast procedure (verified live, about 6 actions in the workshop)
1. `look around` (to get the block's name)
2. `move <block> to inclined plane with a <A> surface`
3. `look at inclined plane with a <A> surface`, done 2-3 times. Note the % after each look, e.g. 6%, 11%.
4. `move <block> to inclined plane with a <B> surface`. Moving it straight off the other plane works.
5. `look at inclined plane with a <B> surface`, the same number of times. e.g. 5%, 10%.
6. Compare the % reached after the same number of looks. Lower % = slower = MORE friction.
7. `focus on inclined plane with a <X> surface`. This ENDS the task right away, so you only get one try. Use the exact full name.
The difference is small (about 1% per tick), so take at least 2 looks on each plane, using the same count and the same command spacing. If the result is still unclear, keep looking until the block reaches "at the bottom of the plane" and count the looks.

## Gold (expert) style, more actions but also fine
`pick up stopwatch`, then `move block to inclined plane with a <A> surface`, then `activate stopwatch in inventory`, then repeat `look at inclined plane with a <A> surface` until it says "at the bottom of the plane". Then `deactivate stopwatch in inventory` and `examine stopwatch in inventory` ("The time reads N ticks"). Repeat on <B>. More ticks = more friction. "block" alone matched wood/steel block. About 50 actions; the fast method is enough.

## Pitfalls
- Focusing on a plane before comparing, or focusing on the wrong plane (mixing up most and least), fails the task, and the task ends on focus.
- Never `focus on` the block or stopwatch. Less friction = FASTER.
