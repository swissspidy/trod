# identify-life-stages-2 (plant life stages) — notes

Task: "focus on the life stages of the <plant> plant, starting from earliest to latest. The plants are located outside."

## Stage order (4 focuses, then the task ends automatically)
1. seed  2. seedling  3. adult  4. reproducing
Do NOT focus on the dead plant (in gold runs the task finished after
'reproducing', without a dead step). Do NOT focus on the animals outside (eggs, juvenile
turtles/beavers/blue jays, etc.); they belong to a different task. Any wrong focus can
fail the task, so focus only on the 4 stages, in order.

## Getting there (start room varies)
Outside is reachable via the kitchen or the greenhouse (also the foundry). Doors start closed:
  open door to kitchen / go to kitchen / open door to outside / go to outside
  (or: open door to hallway, go to hallway, open door to greenhouse, go to greenhouse, ...)
Then: look around. Plants are in "self watering flower pot N" (N varies, e.g. 1-9).

## Exact phrasings that worked (verified live + gold)
  focus on <plant> seed in the seed stage in self watering flower pot <N>
  focus on <plant> tree in the seedling stage in self watering flower pot <N>
  focus on <plant> tree in the adult stage in self watering flower pot <N>
  focus on <plant> tree in the reproducing stage in self watering flower pot <N>
Notes: the seed is named "<plant> seed" (the pot listing shows "a <plant> seed"),
but you still add "in the seed stage". Grown plants are named "<plant> tree" (for apple,
apricot, and avocado). If the listing says something other than "tree", use that word.
The shorter "focus on <plant> tree in the adult stage" (no pot) also worked
when only one adult was present. Reply "You focus on the <plant> tree." = accepted.

## Waiting / growth (the main pitfall)
Plants grow over time, so pot contents change between turns. A stage may be
missing at the start (e.g. no adult, but a seedling is there). Then:
- focus on the stages that exist now, in order
- `wait1` (one tick; avoid plain `wait`, which is 10 ticks and can push the plant past the
  stage or kill it), then `look around` to see the new stage and which pot it is in
- the same plant moves to the next stage (seedling→adult in pot 6 after 2× wait1 in one gold run)
ALWAYS `look around` right before each focus. Pot numbers matter. A pot that held a
seed may now hold a seedling, an adult may have become reproducing, and some pots show
"reproducing stage. On the <plant> tree you see: a flower." That still counts as reproducing.
There may be several pots in the same stage. Any of them is fine.

## Minimal plan (~9-12 actions)
open/go doors to outside (4-6) → look around → focus seed → focus seedling →
(look around; wait1 if needed) → focus adult → look around → focus reproducing.
In the live variation (avocado) all 4 stages were already present, so no waiting was
needed. The 4th correct focus ended the task.
