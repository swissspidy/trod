# ScienceWorld "freeze <substance>" — notes

Task: "freeze <substance> (usually water). First focus on the substance, then change its state."
Every line you send counts as an action, including invalid ones and "look around". The task ENDS on its
own when the focused substance freezes (output: "[...; the task has ended]"). Gold runs finish in ~20 actions.

## Where things are
- Kitchen: freezer (closed), fridge, sink, cupboard (closed; has metal pot/ceramic cup), table with
  glass cup, thermometer (lying in the room). You may start in the kitchen, the hallway, or elsewhere:
  `open door to <room>` then `go to <room>`.
- Bathroom (door from kitchen): sink, bathtub, toilet (already contains water), another glass cup.
- **Sinks can be broken**: "The sink appears broken, and can't be activated". Then use another water
  source (bathroom sink / bathtub). Don't keep retrying the broken one.

## Fast procedure (water)
1. Go to kitchen; `look around`.
2. Get a container: `pick up glass cup` (on table) or `open cupboard`, `pick up metal pot`.
3. `move <container> to sink` → `activate sink` → `deactivate sink`
   (`look at sink` shows "<container> (containing a substance called water)").
   If kitchen sink broken: `open door to bathroom`, `go to bathroom`, fill there the same way.
4. `pick up <container>` then `focus on substance in <container>` → "You focus on the water."
   Focus ONLY once the container holds the substance (empty cup → "No known action matches").
   Never focus on random objects (wrong focus can fail the task).
5. Back to kitchen, `open freezer`, `move <container> to freezer`.
6. `wait` (= 10 ticks) repeatedly; water 10°C → ~3°C after one wait, freezes after 1-3 waits.
   Optional check: `use thermometer on water in <container>` (works without picking up the
   thermometer if it's in the same room).
If the substance is something else (e.g. a liquid already in a container somewhere), find it with
`look around` / `look in <container>`, move its container to the freezer the same way.

## Phrasing gotchas
- Refer to contents as `substance in <container>` or `<substance> in <container>`.
- "Ambiguous request ... 0: ... 1: ..." appears when two same-named objects exist (e.g. two glass
  cups when you're in the bathroom). Answer with just the number as the next action (e.g. `1`).
  Pick the option "(in inventory...)" / "(in sink...)" as appropriate. Sending another command instead
  wastes the turn ("Unknown action").
- `focus on water` alone may be ambiguous/unknown (toilet water, etc.) — use `substance in <container>`.

## Minimal action sequence (kitchen sink works, starting next to kitchen)
open door to kitchen; go to kitchen; pick up glass cup; move glass cup to sink; activate sink;
deactivate sink; pick up glass cup; focus on substance in glass cup; open freezer;
move glass cup to freezer; wait; wait; wait  (stop when task ended)
