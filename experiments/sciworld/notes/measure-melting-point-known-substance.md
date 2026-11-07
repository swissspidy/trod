# Measure melting point of known substance: notes

## Task shape
"Measure MP of <substance> (around the kitchen). Focus on thermometer, then on <substance>. If MP above <T> focus <boxA>; if below focus <boxB>."
Read which colour goes with above and which with below. Colours change per variation.

## Where things are
- Start room varies; you may already be in the kitchen. `look around` first. If you're in the kitchen, `open door to kitchen` / `go to kitchen` fail and waste actions.
- Other rooms: `open door to hallway`, `go to hallway`, `open door to kitchen`, `go to kitchen`.
- Kitchen has: thermometer, both boxes, stove, fridge, freezer, and a cupboard with a **metal pot**.
- Substance can be loose in the fridge (chocolate) or in a cup ("plastic cup (containing a substance called lead)"). If it's not visible: `open fridge`, `open freezer`, `open cupboard`, `look around`.
- Foundry (kitchen → `open door to outside`, `go to outside`, `open door to foundry`, `go to foundry`) has a **blast furnace**. Use it for metals.

## Commands that worked
- `pick up thermometer`, then `focus on thermometer`.
- `focus on <substance>` by bare name, even when it's in a cup or the fridge.
- `move <substance> to metal pot`
- Stove: `move metal pot to stove`, `activate stove`.
- Furnace: `pick up metal pot`, walk to the foundry, `open blast furnace`, `move metal pot to blast furnace`, `activate blast furnace`.
- `use thermometer on <substance>` gives "measures a temperature of X degrees celsius". Repeat it (each action lets time pass; `examine <substance>` is fine as filler). Once melted, the name becomes `liquid <substance>`.
- `focus on <colour> box` answers. Focusing a box ENDS the task at once (a wrong focus can fail it), and `reset task` does not work after the end. Focus only on the thermometer, the substance and the one correct box.

## Fast procedure (~12-20 actions)
1. Go to the kitchen. `pick up thermometer`, `focus on thermometer`.
2. Find the substance. `focus on <substance>`.
3. `open cupboard`, `move <substance> to metal pot`, then heat: stove for low MP, blast furnace for metals.
4. Take 2-4 thermometer readings until it melts or clearly passes <T>.
5. Go back to the kitchen if needed. `focus on <correct box>`.

Gold runs always measured before answering. In the live test I focused the box without measuring: the task ended with no score shown. So do measure.

## Known melting points (°C)
chocolate ~30-35 (gold: above -10 was correct); lead 327 (gold: above 50 correct); tin 232; ice/water 0; mercury -39; sodium chloride 801; soap ~50; wax ~60; orange juice/milk ~0.
If <T> is far from the known MP, the answer is obvious. Still take a reading or two for the subgoal credit.
