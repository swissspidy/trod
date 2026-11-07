# chemistry-mix-paint-secondary-color — notes

Task: "use chemistry to create <color> paint, then focus on the <color> paint".
Recipes (primary paints are red, yellow, blue):
- green = blue + yellow
- orange = red + yellow
- violet/purple = red + blue
Use exactly the TWO needed primaries. Never add the third one (it may make brown/wrong paint).

## Where things are
- Paints are always in the **art studio**: wood cups (and sometimes also tin cups
  on a desk) each holding one primary paint, plus an EMPTY mixing container
  on the table (bowl, jug, ...). Cupboards/closets don't need opening.
- You may start in the art studio or elsewhere (hallway, kitchen...). From a
  non-hallway room: `open door to hallway`, `go to hallway`,
  `open door to art studio`, `go to art studio`. (The art studio only connects
  to the hallway.) Note `go to <room>` needs "to"; `go art studio` fails.
- Every command, including failed/unrecognized ones, costs an action.

## Fast procedure (~6 actions once in the studio)
1. `look around` (see container names and the empty mixer name)
2. `pour <cuptype> cup containing <paint1> paint in <mixer>`
   e.g. `pour wood cup containing blue paint in bowl`
3. `pour <cuptype> cup containing <paint2> paint in <mixer>`
4. `mix <mixer>`  -> "Blue and yellow paint mix to produce green paint."
5. `focus on <color> paint`  (e.g. `focus on green paint`) -> task ends, score 100.

## Pitfalls
- If two kinds of cups hold the same paint (wood cup AND tin cup), the plain
  `cup containing blue paint` is ambiguous and the game asks for a number
  (answering `sw 0`/`sw 1` costs another action). Always include the cup
  type: `wood cup containing <paint> paint`. Gold also used
  `cup containing <paint> paint in art studio` when only wood cups exist.
- Pour into the empty mixer (bowl/jug), not into another paint cup.
- Must `mix <mixer>` — pouring alone does not create the secondary paint.
- Focus ONLY on the final <color> paint; focusing on a wrong object (a primary
  paint, a cup) can end/fail the task. Don't focus before mixing.
- `look at <mixer>` verifies contents ("a bowl (containing green paint)") if unsure.
