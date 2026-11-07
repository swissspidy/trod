# Test conductivity of unknown substance <X> — notes

Task: focus on "unknown substance <X>" (letter varies), test it in a circuit, then
move it to the <conductive box> or <nonconductive box> (box colours vary; READ the task text).
Limit ~100 actions; the expert run takes ~16. Placing it in a box ENDS the task, so pick the right box first time.

## Where things are
- You start in a random room (kitchen, art studio, hallway...). Every room links to the **hallway**,
  and the hallway links to the **workshop**. Doors start closed:
  `open door to hallway`, `go to hallway`, `open door to workshop`, `go to workshop`.
- The workshop has: unknown substance <X> on the floor, the two answer boxes, a battery, 3 wires
  (black + two coloured ones, colours vary), several light bulbs (one may be on the floor, the rest on
  the table), a switch (you don't need it). Run `look around` once to get the exact wire/bulb names.

## Exact working commands (checked live)
- `focus on unknown substance <X>` works right where it is; no need to pick it up first.
  Focus only on the substance: focusing on anything else can fail the task.
- Terminals: `battery anode`, `battery cathode`, `<color> wire terminal 1/2`,
  `anode in <color> light bulb` / `cathode in <color> light bulb`,
  `unknown substance <X> terminal 1/2`.
- `disconnect <color> light bulb` removes all of the bulb's connections, if you need to redo them.
- `look at <color> light bulb` shows on/off and what each terminal connects to.

## Circuit (POLARITY MATTERS: the bulb only lights one way round)
With wires A, B (coloured) and black, bulb L:
```
connect battery anode to <A> wire terminal 1
connect battery cathode to black wire terminal 1
connect <A> wire terminal 2 to cathode in <L> light bulb     <- battery anode side goes to bulb CATHODE
connect <B> wire terminal 2 to anode in <L> light bulb
connect unknown substance <X> terminal 1 to black wire terminal 2
connect unknown substance <X> terminal 2 to <B> wire terminal 1
wait1
look at <L> light bulb
```
Checked live: when bulb anode was wired to the battery-anode side, the bulb stayed OFF even with a
conductive substance. Swapping the bulb's two terminals turned it ON. So a wrongly wired bulb looks
just like "nonconductive", which is the main trap. If the bulb is off, double-check this wiring before
you answer "nonconductive".

## Decide and finish
- Bulb **on** -> conductive -> `move unknown substance <X> to <conductive-colour> box`
- Bulb **off** (with correct polarity) -> `move unknown substance <X> to <nonconductive-colour> box`
- The move disconnects it on its own ("(disconnecting unknown substance <X>)").
- One `wait1` is enough for the bulb to update. `look around` also shows bulb state.

## Pitfalls
- Mixing up which colour is the conductive box: the colours change in every variation.
- Getting the bulb polarity backwards (see above).
- Don't put the substance in a box until you're sure; it ends the episode.
