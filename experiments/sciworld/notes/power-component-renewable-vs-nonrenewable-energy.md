# Power component: renewable vs nonrenewable energy

Task: "turn on the <color> light bulb by powering it with a renewable / nonrenewable power source. First focus on the <color> light bulb."

## Where things are
- Everything you need is in the **workshop** (via the hallway). It holds several light bulbs (on the floor and on the table), wires of various colors, a battery, a switch, a buzzer, a motor, and 1-2 generators.
- Generator types:
  - Renewable: **solar panel**, **wind generator**. They ONLY produce power **outside** (indoors they stay "off", and `activate` fails with "not something that can be activated").
  - Nonrenewable: **gas generator**, **nuclear generator**. These work indoors but need `activate <generator>`.
  - The battery is not the answer. Use a generator of the requested type.
- Rooms that connect to outside: kitchen and greenhouse (also the foundry). Hallway connects to workshop, kitchen, greenhouse, and the other rooms. You may start anywhere; `look around` shows the doors.

## Exact phrasings (tested)
- `open door to hallway`, `go to hallway` ("go to X" works). You can only enter adjacent rooms. A wrong or unknown command still COSTS an action ("No known action matches").
- `focus on red light bulb`: do this FIRST, once, and only on the target bulb. Focusing on a wrong object fails the task.
- `pick up <obj>`, `drop <obj>` (drop works; so does `put down`).
- Wiring (2 wires, a full loop):
  - `connect <generator> anode to <wireA> terminal 1`
  - `connect <generator> cathode to <wireB> terminal 1`
  - `connect <wireA> terminal 2 to cathode in <color> light bulb`
  - `connect <wireB> terminal 2 to anode in <color> light bulb`
- Nonrenewable: then `activate gas generator` / `activate nuclear generator`.
- Picking up a connected component disconnects it, so wire everything only AFTER moving it to its final room.

## Fastest procedure
Nonrenewable (about 9 actions): go to workshop -> `focus on <color> light bulb` -> 4 connects using the gas/nuclear generator -> `activate <generator>`. Everything stays in the workshop.

Renewable (about 15 actions): go to workshop -> `focus on <color> light bulb` -> `pick up <color> light bulb`, `pick up solar panel` (or wind generator), pick up 2 wires -> go hallway -> kitchen or greenhouse -> `open door to outside`, `go to outside` -> drop all 4 (the generator shows "which is on" outside) -> 4 connects. The task ended successfully right after the 4th connect, with no wait needed (`wait1` is fine if it doesn't end).

## Pitfalls
- Don't waste actions wiring the solar or wind generator indoors. It never turns on there.
- Don't use the battery or the wrong generator type.
- Check the workshop listing for which generators exist in this variation (for example gas + wind, gas + solar, or nuclear + solar).
- Keep a spare wire in mind. Any 2 wires work, whatever their color.
