# Mendelian genetics, unknown plant

Task: is <trait> (e.g. blue seed color) dominant or recessive in the unknown <X> plant; focus on <boxA> if dominant, <boxB> if recessive. Box colours vary, so re-read `sw --task`.

## Budget
About 100 actions. Invalid commands and ambiguity prompts plus their "0" answers all count. The gold runs used 145 steps, so DON'T copy them. A live run took 41 actions.

## Where things are
You start in a random room. The greenhouse is off the hallway: `open door to hallway`, `go to hallway`, `open door to greenhouse`, `go to greenhouse`.
The greenhouse has: flower pots with gappy numbers (e.g. 3,4,5,6,7,9; check with `look around`), a seed jar with 2 seeds (one <trait>, one contrasting, e.g. "square blue unknown E seed", "round brown unknown E seed"), a jug, a sink, a closed bee hive, and the answer boxes.

## Fast procedure (verified live)
1. `look around` to get the pot numbers.
2. `move unknown E seed in seed jar to flower pot <A>`. An ambiguity prompt appears; answer `0`. Then `move unknown E seed in seed jar to flower pot <B>`. No need to pick up the jar.
   Leave out "in seed jar" and the 2nd move becomes ambiguous. While a prompt is pending, any non-number input wastes an action.
3. `activate sink`, `move jug to sink`, `pour jug in flower pot <A>`, `pour jug in flower pot <B>`. Keep the sink ON with the jug IN it: it refills itself, so later watering is just the 2 pours.
4. `close door to hallway`, `open bee hive` (the bees pollinate).
5. Loop: `wait` (1 action = 10 ticks), then pour into A and into B. The water runs out each wait, so re-water every cycle.
   Live timeline: seedling after wait 1, adult after wait 2, flowers after wait 3, new seeds on plants after wait 4. `look around` to check.
6. Read the NEW seeds: "On the unknown E plant you see: ... a round blue unknown E seed".
   The parents are pure-breeding, so all F1 seeds show the DOMINANT form.
   If F1 seeds show <trait>, it is dominant: focus on the dominant box. Otherwise it is recessive: focus on the recessive box.
   Judge only the trait the task names; other features (like shape) can differ between plants. If the F1 seeds are mixed or unclear, wait one more cycle.
7. `focus on <box>` ends the task at once. You get one chance only; focusing on a wrong object fails the task.

## Gold reference
Gold also grew an F2 generation before focusing; that is unnecessary. Both gold variations had blue F1 seeds, and the answer was dominant both times. In the live run the F1 seeds were blue on both plants; I focused on the dominant box and the task ended (the score isn't shown).

## Phrasing
- `pour jug in flower pot N` (also "into") works.
- Plain `wait` = 10 ticks; `wait1` = 1 tick (avoid).
- Answer an ambiguity prompt with just the number, e.g. `0`.
