# measure-melting-point-unknown-substance

## Task shape
Task: measure the melting point of <state> unknown substance <X> (kitchen). Focus on the thermometer, then on the substance, then on box A if the melting point is above T, or box B if below.
- Every `sw` call costs 1 action (limit about 100), even look, wait and invalid commands.
- `focus on <box>` ENDS the task. The wrong box fails it. Check the colour against the task text.
- You may start in another room. Use `open door to hallway`, `go to hallway`, `open door to kitchen`, `go to kitchen`.
- The kitchen has the thermometer, the substance (often in a cup), both boxes, a stove, freezer, fridge, and a cupboard holding a metal pot.

## Commands confirmed live
```
pick up thermometer
focus on thermometer
focus on liquid unknown substance j    (lowercase ok)
use thermometer on liquid unknown substance j
pick up ceramic cup   (or: pick up cup containing liquid unknown substance j)
open freezer / move ceramic cup to freezer / close freezer
wait   (10 ticks)
focus on purple box
```
When a solid melts, its name changes to "liquid unknown substance <x>". Use the new name.

## Fastest procedure: use logic first
Room temperature is about 10-25 C.
- **Liquid at room temperature:** the melting point is below room temperature. If T >= 25, focus on the "below" box right after the two focuses and one reading. This is what I did live (liquid J, T=200, purple). The task ended normally, but `sw` showed no score, so the outcome is unconfirmed.
- **Solid at room temperature:** the melting point is above room temperature. If T <= 10, the answer is "above".
- Otherwise, measure:
  - **Solid, T high:** `open cupboard`, `move solid unknown substance <x> to metal pot`, `pick up metal pot`, `move metal pot to stove`, `activate stove`. Then repeat `use thermometer on <substance>`. Heating is about 12 C per action.
    - If it is still solid above T, the answer is "above".
    - If it melts below T, the answer is "below". Gold: melted at about 110 with T=150, so "below".
  - **Liquid, T low:** put the cup in the freezer and measure repeatedly. Cooling is slow, about 1 C per action, and bottoms out near -16.
    - If it is still liquid below T, the answer is "below". Gold: liquid at -16 with T=-10, so "below".
    - If it freezes above T, the answer is "above".
- Each reading advances time, so there's no need for `wait` between readings. `wait` in the freezer gained almost nothing.

## Pitfalls
- Do both focuses first, in order: the thermometer, then the substance (not its cup).
- `examine` is not a template verb. Use `look at`.
- Avoid repeated `look around`.
- Box colours and T vary. Reread the task before the final focus.
