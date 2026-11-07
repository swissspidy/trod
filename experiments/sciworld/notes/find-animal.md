# find-animal (ScienceWorld) — notes

Task text: "find a(n) animal. First, focus on the thing. Then, move it to the <color> box in the kitchen."
(If the task ever names something else like "living thing" / "plant", use the same procedure on the matching object.)

## Where things are
- Animals are at the **outside** location, shown as eggs: `a blue jay egg`, `a butterfly egg`, `a dove egg`
  (could be other animal eggs, e.g. turtle/frog/wolf egg). Any animal egg counts as an animal.
  NOT animals: axe, shovel, wood, fire pit, fountain, ground, air. Fruit in the kitchen bowl is not an animal.
- The target `<color> box` is in the **kitchen** (e.g. "a blue box (containing nothing)").
- Kitchen has a door straight to outside. From hallway: kitchen -> outside. From greenhouse: door to outside too.
  Outside connects to kitchen, greenhouse, foundry.

## Optimal procedure (~7-9 actions)
1. Read the start room. Doors start CLOSED; you must `open door to <room>` before `go to <room>`.
2. Route to outside: e.g. `open door to kitchen`, `go to kitchen`, `open door to outside`, `go to outside`.
   (If you start in kitchen: just `open door to outside`, `go to outside`.)
3. `look around` (optional — eggs are always there; skip to save an action if you trust it).
4. `focus on <animal> egg`   e.g. `focus on dove egg`  -> "You focus on the dove egg."
5. `pick up <animal> egg`    -> "You move the dove to the inventory."
6. `go to kitchen` (door to kitchen from outside is already open if you came that way; otherwise `open door to kitchen` first).
7. `move <animal> egg to <color> box` -> "You move the dove to the <color> box." Task ends (score 100).

Verified live: `focus on dove egg`, `pick up dove egg`, `go to kitchen`, `move dove egg to blue box` all work.
Gold also used `focus on blue jay` / `move egg blue jay egg in inventory to red box` — longer phrasings also work,
but the short `<animal> egg` name is simplest.

## Pitfalls
- FOCUS ONLY ONCE and only on the animal. Focusing on a wrong object (e.g. the box, axe, apple) likely fails the task
  immediately. Do not "focus on" anything just to inspect it — use `look at`.
- The command is `go to <room>` (not `go <room>`), and you can only go to an ADJACENT room listed under
  "You also see: A door to ...". `go to kitchen` from a room without a kitchen door -> "It's not clear how to get there from here."
- `open door to X` only works if that door is in the current room; otherwise "No known action matches that input."
- Every input, including failed/invalid ones and `look around`/`inventory`, consumes one action from the budget.
- The inventory may already contain something (e.g. an orange) — ignore it.
- After the final move the task ends; no further commands are accepted.
