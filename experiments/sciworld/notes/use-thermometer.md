# use-thermometer: notes

## The task
"Measure the temperature of <substance> (in <roomA>). First focus on the thermometer. Next focus on <substance>. If it is above <T>, put it in the <colour1> box. If it is below <T>, put it in the <colour2> box. Boxes are in <roomB>."
Run `sw --task` first and write down <T>, which colour goes with which side, and <roomB>. These change between variations.

## House layout (same in all 3 train variations)
- The hallway is the hub. Its doors lead to the art studio, bedroom, greenhouse, kitchen, living room and workshop.
- The bathroom and the outside are reached only through the KITCHEN, not the hallway.
- The THERMOMETER is in the KITCHEN, lying loose in the room ("a thermometer, currently reading ...").
- The start room varies (hallway, art studio, kitchen...). Doors start closed. `open door to <room>` then `go to <room>`. Opening a door that is already open only wastes an action.
- The unknown substance lies loose in <roomA> (e.g. "unknown substance B").

## Exact command phrasings that worked (checked live)
```
pick up thermometer
focus on thermometer in inventory
open door to hallway / go to hallway
open door to living room / go to living room
pick up unknown substance B
focus on unknown substance B in inventory
use thermometer in inventory on unknown substance B in inventory
   -> "the thermometer measures a temperature of 21 degrees celsius"
go to hallway / go to kitchen / open door to bathroom / go to bathroom
move unknown substance B in inventory to yellow box   -> task ends
```
- Once an item is held, refer to it as "<obj> in inventory".
- Use the substance's name exactly as `look around` prints it, without the article ("unknown substance B").

## Fastest procedure (about 12-18 actions)
1. Go to the kitchen, `pick up thermometer`, then `focus on thermometer in inventory`.
2. Go to <roomA>, `pick up <substance>`, then `focus on <substance> in inventory`.
3. `use thermometer in inventory on <substance> in inventory`.
4. Go to <roomB>. Run `look around` once to confirm the box names.
5. `move <substance> in inventory to <correct colour> box`. Compare the reading with <T> and check the direction carefully.
- If the boxes are in the same room as the substance, skip the walk.

## What fails or wastes actions
- `focus on` is scored: focus ONLY on the thermometer, then ONLY on the substance, in that order. Focusing on a box or anything else can end the task as a failure. Never run `focus on` just to inspect something; use `look at`.
- Putting the substance in the wrong box ends the task with a failure. Re-read the threshold, and the above/below mapping to colours, before moving it.
- The thermometer's own "currently reading X" value is the room or inventory temperature, NOT the substance's temperature. Always use `use thermometer ... on <substance>`.
- Don't heat, cool or wait: you just measure the substance as it is and sort it.
- Readings seen so far: 28, 45, 21 °C.
