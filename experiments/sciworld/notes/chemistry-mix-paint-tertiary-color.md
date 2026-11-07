# chemistry-mix-paint-tertiary-color — notes

## Goal
Task text: "create <tertiary> paint. Part-way done, focus on the intermediate (secondary) paint. Completely done, focus on ..."
The final sentence may name the WRONG paint (e.g. it says "focus on the green paint" for a green-blue target). Gold runs focus on the
TERTIARY paint at the end (`focus on green-blue paint`) and score 100. Focus ends the task, so a wrong focus = failure.
Use only 2 focuses: the secondary first, then the tertiary. Never focus on a cup, a primary paint, or anything else.

## Colour chemistry
- secondary: blue+yellow=green, red+yellow=orange, red+blue=violet/purple
- tertiary = secondary + one more of a primary in it, e.g. green+blue -> "green-blue" (the mix message says "blue green", but the object is named "green-blue").
  Others work the same way: orange+red, orange+yellow, green+yellow, violet+red, violet+blue.
- After each mix, run `look at <container>` to get the exact paint name before you focus.

## Where things are
You may start in another room (kitchen, hallway...). Art studio is off the hallway: `open door to hallway`, `go to hallway`,
`open door to art studio`, `go to art studio`, `look around`.
In the art studio: an empty mixing container (bowl or jug) on the table, plus wood cups of red/yellow/blue paint on the floor.
There can be more cups of paint on a desk (tin cups), in a large cupboard, or in a paint cupboard/closet (open it first). Each cup holds one dose.

## Fast procedure (about 8 actions once you're in the studio; 100-action limit)
1. `pour cup containing <primaryA> paint in art studio in <bowl>`  ("in art studio" picks the cup lying in the room, not one on a desk or in a cupboard)
2. `pour cup containing <primaryB> paint in art studio in <bowl>`
3. `mix <bowl>`  -> "X and Y paint mix to produce <secondary> paint."
4. `focus on <secondary> paint`
5. Pour a second dose of the needed primary. The room cup is now empty, so take one from elsewhere:
   `pour tin cup containing <primary> paint in <bowl>` (desk), or `open large cupboard` / `open paint cupboard` first.
   Verified: `pour cup containing blue paint in art studio in bowl` FAILED once the room's blue cup was empty ("No known action matches").
6. `mix <bowl>`, then `look at <bowl>` -> e.g. "(containing green-blue paint)"
7. `focus on <tertiary> paint`  (e.g. `focus on green-blue paint`)

## Gotchas
- An ambiguous name gives a numbered list ("0: pour tin cup (in desk...) 1: pour wood cup (in art studio)..."). Answer with just the number,
  e.g. `sw "1"`. This works but costs an action. Adding a location ("in art studio") or the cup material ("tin cup", "wood cup") avoids the list.
- `mix` with only one substance inside: "There is only one thing". Check that the pour actually went in.
- Don't pour a cup that has the wrong colour (e.g. red when you are making green-blue). It would spoil the mixture.
- An empty cup shows "(containing nothing)".
