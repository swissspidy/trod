# identify-life-stages-1: notes

Task: "focus on the N life stages of the <animal>, starting from earliest to latest".
Budget is about 100 actions. Each `sw` call, including `look around`, `task` and failed commands, uses 1 action.

## Where things are
The animals are always **outside**. You start in a random room.
- outside has doors to: kitchen, greenhouse, foundry.
- hallway has doors to: kitchen, greenhouse, art studio, bedroom, living room, workshop.
- Doors start closed. Use `open door to <room>`, then `go to <room>`.
  - From kitchen or greenhouse: 2 actions to reach outside.
  - From hallway: open+go to kitchen (or greenhouse), then open+go to outside (4 actions).
  - From other rooms: first go to hallway.
- Outside there are several animals at their first stage, e.g. "a crocodile egg", "a baby wolf", "a turtle egg", "a frog egg". Only the target animal matters.

## Stage names (use the name exactly as `look around` lists it)
- Reptiles/birds (turtle, crocodile, parrot, dove, blue jay, giant tortoise), 4 stages: `<animal> egg` -> `hatchling <animal>` -> `juvenile <animal>` -> `adult <animal>`.
- Mammals (wolf, beaver, elephant), 3 stages: `baby <animal>` -> `juvenile <animal>` -> `adult <animal>`.
- Others probably follow egg -> larva -> ... -> adult (frog: egg/tadpole; butterfly: egg/caterpillar/pupa/butterfly). N in the task tells you how many stages there are. Always read the names from `look around`.

## Commands that work (tested)
- `focus on crocodile egg` / `focus on hatchling crocodile` / `focus on juvenile crocodile` / `focus on adult crocodile` (`focus on egg turtle in outside` also works).
- `wait` = 10 ticks. `wait1` = 1 tick.
- `look around` shows the current stage.
- `look at <old stage name>` gives "No known action matches" once the animal has grown, but it still uses an action.

## Procedure (about 20-30 actions)
1. Go to outside, then `look around` to get the exact first-stage name.
2. `focus on <stage1 name>` right away. It is the earliest stage, so do this before any waiting.
3. Repeat: `wait`, then `look around`. When the animal's name changes, `focus on <new stage name>`.
4. After the final `focus on adult <animal>`, the output says "the task has ended" (success).

Timing: each stage lasts about 8-10 ticks. Gold used wait1 x8 between focuses. One `wait` (10 ticks) usually moves the animal forward exactly one stage. In my run, `look around` right after a `wait` sometimes still showed the old stage. If that happens, do one `wait1` and look again. Do not do several `wait`s in a row without looking. Adult is the final stage; a middle stage could be skipped if you wait too long.

## What fails the task
- Focusing on anything else (another animal, a wrong stage, or the stages out of order) likely ends the task with 0. Focus ONLY on the target animal's current stage, and only once per stage.
- Do not focus on the adult before you have focused on the earlier stages.
- Do not pick up, eat, or move the animals.
