# change-the-state-of-matter-of: notes

Task: "change the state of matter of <substance> (water in every case seen so far). First, focus on the substance." You can change it in either direction: boil it on the stove (fastest) or freeze it in the freezer (slower). The task ends by itself as soon as the state changes.

## Where things are
- Kitchen: cupboard (closed) holding a **metal pot**, tin cup and ceramic cup. Also a stove, oven, freezer, fridge, sink, thermometer and lighter.
- Bathroom (door off the kitchen): sink, bathtub, and a toilet that already holds water.
- You may start in the hallway, art studio or kitchen. Open each door before going through: `open door to kitchen`, then `go to kitchen`.
- A sink can be BROKEN ("The sink appears broken, and can't be activated"). In the live variation the kitchen sink was broken, so use the bathroom sink (or the bathtub) instead.

## Fast procedure (tested live; the task ended after about 2 waits on the stove)
1. Go to the kitchen. `open cupboard`, `pick up metal pot`. The metal pot is safe on the stove.
2. `move metal pot to sink`, `activate sink`, `deactivate sink`. Check with `look in sink`: you should see "metal pot (containing a substance called water)". If the sink is broken, go to the bathroom and do the same there.
3. `pick up metal pot`
4. `focus on water`. If there is other water nearby (for example in the toilet) you get "Ambiguous request ... 0: water (in metal pot, in inventory...) 1: water (in toilet...)". Answer by sending just the number as the next action (`sw 0`). Pick the option that is in your pot. The gold runs used `focus on substance in metal pot`. That worked in their runs but gave "No known action matches" when the pot held no water, so only focus once the water is in the pot.
5. Go to the kitchen, `move metal pot to stove`, `activate stove`.
6. `wait` (10 ticks each time). After one wait the water was at 73°C; the second wait boiled it and the task ended. (Optional check: `pick up thermometer`, then `use thermometer on water in metal pot`.)
That took about 12 actions from the kitchen. The action limit is 100.

## Freeze alternative (what the gold runs did)
Put the pot of water in the open freezer (`open freezer`, `move metal pot to freezer`) and `wait` repeatedly. It went 10°C → 3°C after one wait, so it needs more waits than the stove.

## Pitfalls
- Focus ONLY on the target substance, and only once. Focusing on the wrong object can fail the task, so resolve ambiguity by choosing the option with the right container.
- Use action words exactly as in the templates: `move X to Y` (not "put"), `go to <room>`, `look in X`, `use thermometer on <substance> in <container>`.
- If the substance is something else, for example already solid (ice, chocolate, butter) or in a jar: melt it in a metal container on the stove; freeze liquids in the freezer.
- `wait` = 10 ticks and `wait1` = 1 tick. Use `wait` and check after each one; the task ends automatically.
