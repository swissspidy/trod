# find-plant (ScienceWorld) notes

Task: "find a(n) plant. First, focus on the thing. Then, move it to the <color> box in the <room>" (seen so far: always the kitchen).
Each `sw` call runs ONE action. Every call uses up an action, even ones that fail ("No known action matches that input."). The task ENDS as soon as the final move is done. Nothing more is accepted after that.

## Where things are
- The plants are in the **greenhouse**, each in a numbered flower pot, e.g.
  `a flower pot 4 (containing a pea plant in the adult stage..., soil)`.
  Plants seen: pea plant, cherry tree, apple tree. Pot numbers change between variations, so always `look around` in the greenhouse first.
- The house layout is a hub: the **hallway** connects kitchen, greenhouse, art studio, bedroom, living room and workshop. You can only `go to` a room that is next to yours, so kitchen -> greenhouse must go through the hallway.
  `open door to greenhouse` from the kitchen fails, and still uses an action.
- Doors start closed. Open each one once (`open door to <room>`). It stays open, including when you come back.
- The target box (e.g. `blue box`) is in the kitchen.

## Fast procedure (about 8-10 actions)
1. If you are not in the hallway: `open door to hallway`, `go to hallway`
2. `open door to greenhouse`, `go to greenhouse`
3. `look around` to find the pot number N of a pot that holds a living plant
4. `focus on <plant name>`. Verified working: `focus on pea plant`, and gold used `focus on adult cherry tree`. Any of the plants counts as "a plant".
5. `pick up flower pot N`. Take the whole pot, with its soil, into your inventory.
6. `go to hallway`, then `open door to kitchen` (skip this if the door is already open), then `go to kitchen`
7. `move flower pot N to <color> box`. This short form worked. The gold run used
   `move flower pot N containing <plant> and soil in inventory to <color> box`. That works too, but you don't need it.

## Pitfalls
- `focus on plant` fails: "plant" by itself is not a valid object name. Use the plant's exact name as the room shows it (`pea plant`, `cherry tree`, `apple tree`).
- Only focus on the plant. Focusing on something else (a pot, the soil, the bee hive, a fruit in the kitchen bowl like the apple or banana) can lose the task immediately, because focus is checked against the target. Don't use focus to "inspect" things; use `look at` for that.
- Don't focus on an empty pot ("containing nothing").
- Focus first, then pick up and move. The order matters ("First, focus...").
- Move the pot, not the plant alone. Moving the pot worked in all runs.
- Only use `go to <room>` for rooms next to where you are. Otherwise you get "It's not clear how to get there from here." The command is `go to X`. In the gold runs, `open door to X` always came before going through.
- Don't waste actions on `--help`, `task` or extra `look around` calls; the budget (about 100) is plenty, but failed actions still count.
