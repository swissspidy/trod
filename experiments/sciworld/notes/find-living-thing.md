# find-living-thing: notes

Task: "find a(n) living thing. First, focus on the thing. Then, move it to the <color> box in the <room>" (so far always the kitchen).
Every action you send counts, including failed ones, so don't send test commands.

## Where the living thing is
- The **outside** has animal eggs lying on the ground, e.g. `blue jay egg`, `butterfly egg`, `dove egg` (other variations may have other eggs or animals). Any one of them counts as living. The gold runs used butterfly and blue jay; I used dove in the live run.
- The outside can be reached from the **kitchen** ("door to the outside"). The kitchen can be reached from the hallway. The greenhouse (plants, also living) also opens onto the outside, but the eggs are quicker.
- The target box (e.g. `blue box (containing nothing)`) sits in the kitchen.

## Fastest procedure (about 6-9 actions)
1. Read the start room in the starting observation. Don't open a door that isn't listed there: `open door to kitchen` while already in the kitchen gives "No known action matches", and the action still counts.
   - Start in the hallway: `open door to kitchen`, then `go kitchen`.
   - Start in another room (e.g. art studio): `open door to hallway`, `go hallway`, then as above.
   - Start in the kitchen: go straight to step 2.
2. `open door to outside`, then `go outside` (`go to outside` also works).
3. Optionally `look around` to confirm the egg names. The usual eggs are listed above, so you can skip this.
4. `focus on <animal> egg`, e.g. `focus on dove egg`. Reply: "You focus on the dove egg."
5. `pick up <animal> egg`. Reply: "You move the dove to the inventory."
6. `go kitchen`. The door is already open, so you don't need to open it again.
7. `move <animal> egg to <color> box`, e.g. `move dove egg to blue box`. The task then ends with success ("the task has ended").
   The gold runs used `move egg butterfly egg in inventory to red box`, which also works, but the short form is fine.

## Pitfalls
- **Focus only once, and only on a living thing.** Focusing on a non-living object (axe, wood, fountain, apple, picture, etc.) probably fails the task. Only focus on eggs, animals or plants. Do **not** focus on the box.
- Focus must come **before** you move the thing to the box.
- Fruits in the kitchen bowl (apple, banana, orange) and the potato are risky choices. Use an egg.
- The inventory may already hold something (I had an orange). Ignore it and don't move it into the box.
- Use full names as they appear in the observations (`dove egg`, `blue jay egg`). The object is then renamed in messages ("the dove"), but `<animal> egg` still resolves.
- Once the task has ended, no more actions are accepted.
- If no eggs are outside, check the greenhouse (`open door to greenhouse` from outside). Focus on a plant or seed there (e.g. `<plant> plant`), pick it up, and carry it to the box the same way.
