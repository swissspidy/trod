# power-component (ScienceWorld): "turn on the <color> light bulb"

Task: focus on the <target> (e.g. red light bulb), then wire a circuit that powers it.
Optimal run takes about 9-11 actions. EVERY command counts as an action, even ones the game rejects
("No known action matches that input."), so don't guess.

## Where things are
- Everything is in the **workshop**. You may start in the kitchen, art studio, hallway, etc.
  The workshop door only opens from the **hallway**, so from any other room:
  `open door to hallway` -> `go to hallway` -> `open door to workshop` -> `go to workshop`.
  (In the kitchen, `open door to workshop` fails because no such door exists there.)
- In the workshop: a battery, 2-3 colored wires (black/orange/green/yellow/red/blue..., which
  colors appear varies), a switch, several light bulbs, a buzzer, a motor, and generators
  (solar/wind/gas/nuclear). The target bulb may be on the floor or on the table; you can
  connect it either way. Do NOT pick anything up.

## Procedure (verified)
1. Navigate to the workshop (see above). Optionally `look around` once to read the wire colors.
2. `focus on <target>` e.g. `focus on red light bulb`. Focus only on the target. Focusing on
   the wrong object can end/fail the task.
3. Use the battery and any two wires, <w1> and <w2>:
   - `connect battery anode to <w1> wire terminal 1`
   - `connect battery cathode to <w2> wire terminal 1`
   - `connect <w1> wire terminal 2 to cathode in <target>`
   - `connect <w2> wire terminal 2 to anode in <target>`
   Example: `connect green wire terminal 2 to cathode in red light bulb`.
   The task completes as soon as the last connection is made, with "the task has ended".
   No `wait` or `activate` is needed. A follow-up `look at` may still say the bulb is "off". Ignore it.
   (Anode->bulb cathode via one wire and cathode->bulb anode via the other is what the
   experts did, and it scored 100.)

## Phrasing tips
- Terminals are `anode`/`cathode` on the battery and bulb, and `terminal 1`/`terminal 2` on wires.
- Both "battery anode" and "cathode in red light bulb" work as names.
- Name objects by their visible name without the article: `red light bulb`, `green wire`.
- `look at <obj>` shows what is connected, if you need to debug. `disconnect <obj>` exists.
- Don't use the switch or a generator. They're unnecessary, and the switch would have to be
  activated. The battery is enough.
- If there are two of the same name, the game asks you to pick a number. Answer with the number.
