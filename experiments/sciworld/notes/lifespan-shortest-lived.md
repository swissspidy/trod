# lifespan-shortest-lived (also works for longest-lived variants)

Task: "find the animal with the shortest life span. The animals are in the 'outside' location. Focus on the animal with the shortest life span."
Score comes ONLY from the single `focus on` action. Focusing on the wrong thing ends the task (fail), so do not focus on anything else. Nothing else is needed: no picking up, no waiting.

## Fast procedure (4-7 actions)
1. Read the start room's door list. You can reach outside from the kitchen, greenhouse, or foundry (hallway -> kitchen/greenhouse -> outside).
   Doors start CLOSED: `open door to <room>` then `go to <room>`.
   e.g. from the hallway: `open door to greenhouse`, `go to greenhouse`, `open door to outside`, `go to outside`.
   From the art studio: hallway -> kitchen -> outside.
2. `go to outside` prints only "You move to the outside." Run `look around` to list the animals.
   (Skip it if you already know the names. The list shows things like "a baby chipmunk", "a chameleon egg", "a giant tortoise egg".)
3. `look at <animal>` gives no lifespan info, so don't waste actions on it. Decide from real-world lifespans.
4. `focus on <name as listed>`, e.g. `focus on baby chipmunk` (tested, accepted). Gold used `focus on baby baby mouse`; the doubled form also works. For eggs use the full name: `focus on chameleon egg`.
   The task ends right after the focus.

## Typical lifespans, shortest to longest (use for ranking)
mayfly < dragonfly (~0.5-1 yr incl. nymph; adult weeks) ~ butterfly/moth/bee (weeks-months)
< mouse (~1-2) < hamster < frog/toad(small) < chipmunk (~2-3) < rabbit / squirrel / hedgehog (~3-6)
< chameleon (~5-10) < blue jay/dove (~7-15) < beaver/wolf (~10-15) < brown bear (~25) < owl/crow (~10-20+)
< parrot (~50) < crocodile/alligator (~70) < elephant (~70) < turtle (~50-100) < giant tortoise (~150+).
Rules: insects are always shortest. Among mammals, small rodents (mouse) are shortest. Reptiles like tortoises/turtles and big animals are longest.
Seen in train variations: {baby mouse, ...} -> mouse; {baby dragonfly, ...} -> dragonfly; {baby chipmunk, chameleon egg, giant tortoise egg} -> chipmunk.
Usually 3 animals are present, at mixed life stages (egg / baby / adult). The life stage doesn't matter; rank by species.

## Pitfalls
- Don't use `focus on` to "inspect" something. It is a final, irreversible choice.
- Plants or other objects outside (axe, shovel, wood, fountain, fire pit) aren't animals.
- If a door name isn't recognised, `look around` and copy the exact wording.
- For a longest-lived variant, pick the other end of the list (tortoise/turtle/elephant/parrot).
