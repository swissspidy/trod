# lifespan-longest-lived — notes

Task: "find the animal with the longest life span. The animals are in the 'outside' location. Focus on the animal with the longest life span."
Variants may ask for the SHORTEST instead, so read the task line. This is a pure knowledge task: no measuring, no waiting, no devices.

## Procedure (about 3-7 actions)
1. Your start room varies (hallway, art studio, kitchen, ...). Doors start CLOSED, so you must `open door to <room>` before `go to <room>`.
2. Rooms with a door to **outside**: kitchen, greenhouse, foundry. From the hallway, take greenhouse or kitchen.
   - from the hallway: `open door to greenhouse`, `go to greenhouse`, `open door to outside`, `go to outside`
   - from the art studio: `open door to hallway`, `go to hallway`, `open door to kitchen`, `go to kitchen`, `open door to outside`, `go to outside`
   - from the kitchen: `open door to outside`, `go to outside`
3. `look around` lists the animals. They often appear as eggs or babies, e.g. "a giant tortoise egg", "a baby chipmunk", "a chameleon egg".
4. `focus on <name exactly as listed>`. **focus ENDS the task right away. A wrong focus is a fail, so focus only once, on the right animal.** Don't focus on anything else, and don't `look at` animals (it shows nothing useful and wastes actions).

## Object naming quirk
- Gold used `focus on baby baby brown bear`, and the game replied "You focus on the baby brown bear". Live, `focus on giant tortoise egg` worked as listed. So try the name exactly as `look around` prints it, without the article "a/an". If the game says the object is ambiguous or unknown, the doubled-prefix form (`baby baby <animal>`) is what worked in gold.

## Approximate max lifespans (pick the largest; for "shortest" pick the smallest)
- giant tortoise ~150+ yr (longest whenever present)
- blue whale ~90
- elephant ~70
- crocodile ~70
- parrot ~60-80
- brown bear ~25-30
- dolphin ~40
- wolf ~15
- beaver ~12-20
- chameleon ~5-10
- rabbit ~9
- chipmunk ~3-8
- frog ~10
- hedgehog ~5
- mouse ~2
- moth/butterfly/bee/dragonfly <1

Seen in train/live:
- the outside held only a few animals. Brown bear was the answer when no tortoise was present.
- the live set (giant tortoise egg, baby chipmunk, chameleon egg) has answer giant tortoise.
- Other objects outside (axe, fire pit, fountain, shovel, wood, ground) are distractors.

## Don'ts
- Don't wait or try to hatch the eggs; the egg counts as the animal.
- Don't pick up the animals.
- Don't use `reset task`.
