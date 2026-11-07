# Boil task notes (ScienceWorld "boil")

Task: "boil <substance>": focus on the substance, then heat it until it changes state (liquid to gas). For things that can't boil, burning them also counts. The task **ends by itself** once the state changes, so just keep heating.

## Where things are
- Kitchen: thermometer (on the floor of the room), **metal pot in the closed cupboard** (`open cupboard` first), stove, oven, sink, lighter, freezer/fridge. You may start in another room. Every door starts closed: `open door to <room>` then `go to <room>`.
- Water: kitchen sink. **The sink may be BROKEN** ("appears broken, can't be activated"). If so, use the **bathroom sink** (kitchen -> bathroom door). The toilet also has water.
- **The stove may be broken** too. Backup heater: the blast furnace in the **foundry** (kitchen -> `open door to outside`, go outside, `open door to foundry`, go foundry, `open blast furnace`, move pot in, `activate blast furnace`). The oven is another option (`open oven`).
- Other substances (ice, chocolate, etc.) may be in the fridge/freezer or a cupboard. Run `look around` and open containers to find them. Ice melts first, then boils, so keep heating.

## Working commands (verified)
```
open cupboard
pick up metal pot
move metal pot to sink
activate sink
deactivate sink
pick up metal pot          # pot now "containing a substance called water"
focus on water             # if it's ambiguous, a numbered list comes up:
0                          # send just the number for "water (in metal pot...)"
move metal pot to stove
activate stove
wait                       # = 10 ticks; water went 10°C -> boiling in ~1-2 waits
use thermometer on water in metal pot   # works without picking up the thermometer
```
- `focus on substance in metal pot` works only while the pot actually holds something. On an empty pot it answers "No known action matches". Commands that don't parse still use up an action.
- Ambiguity prompts: reply with just the number (`sw 0`). Each reply costs an action.

## Pitfalls
- **Focus only on the target substance**, and only once. Focusing on the wrong thing (e.g. the toilet water or the pot) can fail the task. Make sure the substance is in your container first, then focus on it (pick option "in metal pot").
- Check every device's reply. "broken" means switch to the backup right away; don't keep retrying.
- Use the metal pot, not a glass/wood/plastic cup, on the heat (other cups can melt or burn).
- The pot has to be ON the stove (`move metal pot to stove`) before `activate stove`.
- Use `wait` rather than checking the thermometer over and over (each check costs an action).

## Fast plan (~12-15 actions)
Go to kitchen -> open cupboard -> pick up metal pot -> fill it at a working sink (or get <substance>) -> pick up pot -> focus on <substance> (number for the pot) -> move pot to a working heater -> activate it -> wait (repeat) until "task has ended".
