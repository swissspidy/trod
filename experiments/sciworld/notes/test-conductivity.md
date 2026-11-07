# test-conductivity: notes

Task: "determine if <obj> is electrically conductive ... First, focus on <obj>. If conductive, put it in the <A> box; if nonconductive, the <B> box." The box colours change with each variation, so read them from the task text (`sw --task`).

## Practical
- Run `sw` from the work dir. You can send several actions in one call, one per line: `sw "a
b
c"`. Invalid actions still use up the action budget.
- You start in a random room. Doors are closed and you can only open a door that is in your current room. If there is no workshop door, go through the hallway: `open door to hallway`, `go to hallway`, `open door to workshop`, `go to workshop`.
- The workshop has <obj> on the floor, both answer boxes, a battery, 2-3 coloured wires and several light bulbs (on the table or on the floor). Some bulbs and wires share colours with the boxes, which is fine. If the task says <obj> is "around the <room>", look there and carry it with `pick up <obj>`.

## Procedure (~17 actions; tested live, score 100)
1. `focus on <obj>`. Use the exact name from `look around`. You don't need to pick it up first. Focusing on the wrong object can fail the task, so focus only once.
2. Build a series loop. **Polarity matters**: the battery ANODE must lead to the bulb CATHODE. Wiring it the other way leaves the bulb off even with a conductor.
```
connect battery anode to <wire1> terminal 1
connect <wire1> terminal 2 to cathode in <bulb>
connect <wire2> terminal 2 to anode in <bulb>
connect <obj> terminal 1 to <wire3> terminal 2
connect <obj> terminal 2 to <wire2> terminal 1
connect battery cathode to <wire3> terminal 1
```
(With only 2 wires, connect the bulb straight to <obj>: `connect <bulb> anode to <obj> terminal 2`. Direct part-to-part connections work.)
3. `wait1` (two to be safe), then `look at <bulb>`. It shows "which is on/off" plus what each terminal connects to.
4. If the bulb is on, <obj> is conductive: `move <obj> to <A> box`. If it is off, <obj> is nonconductive: `move <obj> to <B> box`. Moving <obj> disconnects it automatically, and the task ends at that point.

## Pitfalls
- A bulb that is off can mean a wiring mistake rather than a nonconductor. Before you answer "nonconductive", run `look at <bulb>` and check that the anode traces back to the battery cathode through <obj> and that the cathode traces back to the battery anode.
- If you wired it backwards, `disconnect battery` frees both battery terminals. Then reconnect with the terminals swapped (anode to the other wire) and wait1 again.
- Terminal names: battery and bulb use `anode` / `cathode`. Wires, the switch and <obj> use `terminal 1` / `terminal 2`. Both `<bulb> cathode` and `cathode in <bulb>` work.
- You don't need the switch. If you do use it, it starts off and must be activated.
- Write "a" names as plain names: `aluminum foil`, `red light bulb`, `blue box`.
- Usually metals are conductive; plastic, wood, glass, rubber and paper are not. Trust the bulb result.
