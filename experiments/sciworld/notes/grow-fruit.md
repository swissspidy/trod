# grow-fruit notes (ScienceWorld)

You get about 100 actions. The gold runs used 70-88. The live run finished in 77 and about 60 is possible.

## Map
- Seeds: kitchen, in a **seed jar** (5x `<fruit> seed`). Use `pick up seed jar`.
- Greenhouse (off the hallway): flower pot 1/2/3, jug, sink, bee hive (closed). The pots may already have soil, or there's one loose `soil` + a shovel, or **no soil and no shovel**.
- Outside (door in the greenhouse): shovel, ground.
- **Ignore** fruit in the kitchen bowl (red apple etc.). Focusing on fruit you didn't grow fails the task.

## Commands that work
- `open door to <room>`, then `go to <room>`. You can only go to adjacent rooms: kitchen -> hallway -> greenhouse.
- Soil: `pick up shovel`, go outside, then repeat `use shovel on ground` + `pick up soil in outside` 3 times. (Plain `pick up soil` is ambiguous once you hold soil.)
- `move soil in inventory to flower pot N`. Ambiguous when you hold several soils: answer `0`.
- `move <fruit> seed in seed jar to flower pot N`. Always ambiguous: answer `0`.
- Water: `activate sink`, `move jug to sink` once. After that, `pour jug into flower pot N`, then `move jug to sink`. **Leave the sink on with the jug in it** so it refills.
- `wait` = 10 ticks for 1 action. `wait1` = 1 tick. Use `wait`.
- End: `focus on <fruit>` (e.g. `focus on red apple`), then `0`. The list should show "(in <fruit> tree, in flower pot N, in greenhouse)".

## AMBIGUITY TRAP
If you send several lines in one `sw` call, a line that triggers "Ambiguous request" makes the **next line count as the number answer**. That line is lost. Always put a `0` line right after any command that may be ambiguous.

## Fast procedure
1. Go to the kitchen, `pick up seed jar`, go to the greenhouse, `look around`.
2. Get soil into all 3 pots if they're missing it.
3. Plant one seed in each pot (+`0` each).
4. `activate sink`, `move jug to sink`, then water all 3 pots.
5. `close door to outside`, `close door to hallway`, `open bee hive`. Bees pollinate. Doors must be closed. Opening the hive early is fine.
6. Repeat: water all 3 (6 actions), then `wait`, then `look around`. Water is gone after about 10 ticks, so **water before every wait**. Dry soil can kill the plants.
   Stages: seed -> seedling -> adult -> reproducing (flower) -> wilting flower -> fruit on the tree. Live: waits 1/2/3/4 gave seedling / adult+reproducing / flowers / fruit.
7. When "a <fruit>" shows on a tree in a pot, run `focus on <fruit>` + `0`. Done.

## Don'ts
- Extra `look at` or `look around`, or reopening open doors: wasted actions.
- Never focus on anything else. A wrong focus ends the task.
