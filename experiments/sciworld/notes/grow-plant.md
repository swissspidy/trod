# grow-plant: notes (checked on the live variation)

Task: "grow a <plant> plant from seed. Seeds in <room>. First focus on a seed, then grow it to the reproduction stage."
You can finish in about 25-35 actions. The limit is about 100.

## Map (it repeats across variations)
- Seed jar: in the kitchen (or the room the task names), shown as "a seed jar (containing a <plant> seed, ...)".
- Greenhouse: has flower pot 1/2/3, a jug, a sink and a bee hive. Routes: kitchen -> outside -> greenhouse, or hallway -> greenhouse.
- Doors start closed. Use `open door to <room>`, then `go to <room>`.
- Pots differ by variation: (a) already "containing soil"; (b) empty, with loose `soil` lying in the greenhouse; (c) empty with NO soil in the greenhouse. For (c), go outside: `pick up shovel`, `use shovel on ground` (makes soil nearby), `pick up soil`, then carry it back.

## Procedure (works)
1. `pick up seed jar` (takes the whole jar, 1 action)
2. Go to the greenhouse. `look around` to see what the pots contain.
3. If the pot has no soil: `move soil to flower pot 1`
4. `move <plant> seed to flower pot 1` -> "Ambiguous request" with a numbered list. Your NEXT command must be `0`. Any other command is treated as a bad answer and the action is wasted.
5. `focus on <plant> seed in flower pot 1`. Focus only on the seed. Focusing on the wrong object can fail the task, so don't focus on anything else.
6. Water it: `move jug to sink`, `activate sink`, `pour jug in flower pot 1`, `deactivate sink`. The jug can stay in the sink. Next time, just `activate sink`, `pour jug in flower pot 1`, `deactivate sink`.
7. `wait` (= 10 ticks). `wait1` = 1 tick. After 10 ticks the water is used up, so re-water before each wait.
   Stages: seed -> seedling (after the 1st wait) -> adult (after the 2nd) -> reproducing (1-2 ticks after the 3rd watering).
8. Repeat watering and `wait` until the task ends by itself. Live run: water, wait, water, wait, then `activate sink` ended the task (37 actions, about 10 wasted).

## Check progress
- `look at flower pot 1` shows e.g. "(containing a <plant> tree in the adult stage, soil)". If "water" is gone, water again.
- Don't let the pot stay dry for long, or the plant may die. The expert re-watered every 5 ticks (5x `wait1`), which is also safe.

## Command phrasing
- Works: `pour jug in flower pot 1` ("into" too), `move <x> to <y>`, `use shovel on ground`.
- Doesn't work: `score` (Unknown action).
- Water: the sink only fills a container that is IN it while the sink is on. The fountain outside also holds water.

## Minimal script (pots already have soil)
open door to <next room> / go to ... until greenhouse; pick up seed jar on the way;
move <plant> seed to flower pot 1; 0; focus on <plant> seed in flower pot 1;
move jug to sink; activate sink; pour jug in flower pot 1; deactivate sink; wait;
activate sink; pour jug in flower pot 1; deactivate sink; wait;
activate sink; pour jug in flower pot 1; deactivate sink; wait1 (repeat wait1 until it ends).
