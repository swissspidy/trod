# ScienceWorld "melt <substance>" notes

Task: "melt <substance>. First focus on the substance, then change its state."
Score 100 is given and the task ENDS on its own once the focused substance turns from solid to liquid.

## Key facts (checked live)
- Pick an object by the name the observation shows: `pick up metal pot`, `open freezer`, `go to kitchen`
  (`go kitchen` works too). Open a closed door first: `open door to kitchen`.
- Refer to the contents of a container as `substance in <container>`:
  `focus on substance in metal pot` -> "You focus on the water." `focus on water` does NOT work.
- FOCUS ONLY ONCE, and only on the target substance. Focusing on the wrong thing can fail the task.
  Focusing on liquid water and then freezing/melting it still counts.
- `wait` = 10 ticks, `wait1` = 1 tick. Each costs one action.
- Devices can be broken ("appears broken, and can't be activated"). Then use another one:
  sink broken -> bathroom sink (also bathtub, toilet water). Stove broken -> blast furnace in the foundry
  (kitchen -> `open door to outside` -> outside -> `open door to foundry` -> foundry; `open blast furnace`,
  move the container in, `activate blast furnace`).
- You can `move metal pot to stove` straight from the freezer without picking it up first.
- The freezer works with its door open. Water in a metal pot froze in about 2 `wait`s (10C -> 3C -> ice).

## Layout
Kitchen: cupboard (metal pot, tin/ceramic cup), freezer, fridge, stove, oven, sink, thermometer.
Kitchen's doors: hallway, bathroom (and sometimes outside). Hallway connects art studio, bedroom, greenhouse,
kitchen, living room, workshop. Foundry (blast furnace) is off the outside.
You may start in any room. Use `look around` once in each new room.

## Procedure for water, about 15 actions
1. Go to the kitchen. `open cupboard`, `pick up metal pot` (metal is safe on stove/furnace).
2. `move metal pot to sink`, `activate sink`, `deactivate sink`, `pick up metal pot`
   (if the sink is broken, use the bathroom sink).
3. `focus on substance in metal pot`.
4. `open freezer`, `move metal pot to freezer`, `wait`, `look at freezer`; repeat `wait` until it says "ice".
5. `move metal pot to stove`, `activate stove` (if broken: blast furnace), then `wait1` until the task ends.
   Live run: it ended after 1 `wait1`.

## Other substances (general)
- If the substance is already a solid (ice in the freezer, chocolate in the fridge, a metal like lead/tin in the
  workshop/foundry), focus on it where it is (`focus on <substance>` or `focus on substance in <container>`).
  Then put it in a metal pot and heat it.
- Low melting points (ice, chocolate, butter): stove. High melting points (lead, tin, other metals): blast furnace.
- Don't eat, pour away, or mix the focused substance. Don't leave the pot heating long after it melts,
  because boiling is a different state. The task usually ends at the melt anyway.
- Skip thermometer checks; `look at <device>` shows the state.
