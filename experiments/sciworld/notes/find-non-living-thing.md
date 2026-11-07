# find-non-living-thing — notes

Task: "find a(n) non-living thing. First, focus on the thing. Then, move it to the <color> box in the <room>" (so far always the kitchen).

## Fastest procedure (3–7 actions)
1. `look around` (or read the start text) to see where you are. In the live run the agent STARTED IN THE KITCHEN. In the gold runs it started in the hallway or the art studio.
2. If you're not in the target room yet: `open door to <room>` then `go to <room>`. Doors start closed. From the art studio you go through the hallway first: `open door to hallway`, `go to hallway`, `open door to kitchen`, `go to kitchen`.
   - Opening a door or going to a room you can't reach from where you are wastes an action ("No known action matches", "It's not clear how to get there"). Only use the doors listed under "You also see".
3. `focus on <object>`: pick an obviously non-living, portable object that is ALREADY IN the target room.
4. `move <object> to <color> box`. The task ends right after this ("the task has ended") = success (gold score 100).

## Good non-living picks in the kitchen (all verified)
- `lighter` (live run: `focus on lighter`, `move lighter to blue box` -> ended, success)
- `glass jar` (gold: `focus on glass jar`, `move glass jar to red box`). It holds sodium chloride; moving the container is fine.
- `drawer in counter` (gold: `focus on drawer in counter`, `move drawer in counter to green box`)
- Others that should work: stopwatch, thermometer, glass cup (on the table), painting.
Any room's objects are usable (picture in the hallway, wood cup / bowl in the art studio, etc.). But the box is in the kitchen, so picking from the kitchen saves moves.

## What can fail the task
- Focus is final: `focus on` a LIVING thing (red apple, banana, orange, potato, plants, animals, seeds) or a substance probably fails or locks the task. Never focus on food, plants, animals, or "air"/"soap"/water. Don't use `focus` just to inspect something; use `look at`.
- Avoid fixed or huge things (counter, fridge, oven, stove, sink, table, chair, cupboard, door). They may not be movable.
- Don't focus on the box itself.

## Phrasing tips
- Use object names exactly as `look around` prints them, minus the article: "a glass jar (containing ...)" -> `glass jar`.
- For something on or in another object, say `<obj> in <container>` if the bare name is ambiguous, e.g. `drawer in counter`.
- If a name is ambiguous the game asks you to pick a number. Answer with just the number.
- Invalid commands still use up one of the action budget (100). The game doesn't print a score; when the task ends after the move, it worked.

## Minimal script (if you start in the kitchen)
```
focus on lighter
move lighter to <color> box
```
If you start elsewhere, go to the kitchen first (via the hallway if there's no direct door), then do the same.
