# Mendelian genetics (known plant = pea) — notes

Task: "determine whether <trait> (e.g. tall plant height) is dominant or recessive in the pea plant. If dominant focus on <boxA>, if recessive focus on <boxB>."
Every action counts, including failed ones and the "0"/"1" replies to "Ambiguous request" (limit about 100). `focus on` ENDS the task, so focus on a box exactly once, and only on the correct box.

## Layout
Start may be e.g. kitchen: `open door to hallway`, `go to hallway`, then `open door to greenhouse`, `go to greenhouse`. The greenhouse has a seed jar with 2 parent pea seeds, empty flower pots (numbers have gaps; read them), a jug, a sink, a closed bee hive and the two answer boxes.

## Commands that work (verified)
- `move wrinkly orange pea seed to flower pot 1`: name the seed by its full description. You don't have to pick up the jar.
- `move jug to sink`, `activate sink`, `pour jug in flower pot N`, `move jug to sink`. Leave the sink ON with the jug in it so it refills itself, and keep returning the jug to the sink after each pour.
- `close door to hallway`, `open bee hive` (the bees pollinate the plants).
- `wait` = 10 ticks (`wait1` = 1 tick). Pots dry out within about 10 ticks, so water every pot you care about before each `wait`.
- Harvesting seeds off a plant: `move pea seed to flower pot N` gives an "Ambiguous request" list such as `0: move pea seed (in pea plant, in flower pot 1 ...)`. Reply with the number whose source is the plant you want. `move pea seed in flower pot 1 to ...` FAILS.

## Fast procedure (about 55 actions)
1. Plant each parent seed in its own pot and water both.
2. `close door to hallway`, `open bee hive`.
3. Repeat [water both pots, `wait`, `look around`] until each plant has seeds on it (about 4 waits). Stages: seedling, adult (height shown), reproducing (flower), seeds.
4. Move 1 seed from EACH parent plant into 2 empty pots and water them. After that, only water the new pots. Repeat [water, `wait`, `look around`] about 2 times, until the new plants show "adult stage with a <tall/short> height".
5. These cross-bred (F1) offspring all show the DOMINANT form. If they show <trait>, focus on the dominant box. Otherwise focus on the recessive box.

## Pitfalls
- Seed descriptors such as round/wrinkly and orange/green are separate traits. They do NOT tell you the plant's height. You have to grow the plants and read "with a tall/short height" in `look around`.
- Don't decide from the parents alone: one parent shows the trait and the other doesn't.
- If the task asks about another trait (seed shape/colour, flower colour), use the same logic. Read that trait on the F1 plants or on the seeds they produce.
- Result in all 3 known runs (2 gold runs + the live one): tall was DOMINANT, and the F1 plants were all tall. If you're short on actions, the answer "tall = dominant" (Mendel) fits every variation seen so far, but confirming with F1 is safer.
