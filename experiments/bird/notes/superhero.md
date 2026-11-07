# Superhero DB notes

## Schema (star around `superhero`)
- `superhero`(id, superhero_name, full_name, gender_id, eye_colour_id, hair_colour_id, skin_colour_id, race_id, publisher_id, alignment_id, height_cm, weight_kg).
- Lookups: `gender`(id,gender), `alignment`(id,alignment), `race`(id,race), `publisher`(id,publisher_name), `colour`(id,colour), `attribute`(id,attribute_name), `superpower`(id,power_name).
- Bridges: `hero_power`(hero_id,power_id) 5825 rows, no dup pairs; `hero_attribute`(hero_id,attribute_id,attribute_value) one row per hero+attribute, values 5..100.
- The 3 colour FKs all point to `colour`. For two colour filters, join `colour` twice under different aliases (eye T2, hair/skin T3).

## Coded values (verified)
- gender: 1 Male, 2 Female, 3 N/A
- alignment: 1 Good, 2 Bad, 3 Neutral, 4 N/A ("villain"/"bad" = 'Bad'). 6 heroes have NULL alignment_id.
- attribute: 1 Intelligence, 2 Strength, 3 Speed, 4 Durability, 5 Power, 6 Combat. Names are Title Case: 'durability' in a question means `attribute_name='Durability'`.
- colour: 1 'No Colour' (= "no eye colour"), 7 Blue, 9 Brown, 12 Gold, 14 Green, 6 'Blond', 31 White, 23 Red ... Values are Title Case: 'blue' means 'Blue'.
- race: 1 '-' (unknown), 24 'Human', 21 'God / Eternal' (written with spaces), 42 Mutant, 2 Alien. Title Case: 'human' means 'Human'.
- publisher: 1 '' (empty), 4 'DC Comics', 13 'Marvel Comics', 3 'Dark Horse Comics', 5 'George Lucas'. "DC" means 'DC Comics'.
- Power names are Title Case.

## Data traps
- height_cm and weight_kg: NULL or 0 both mean missing (155 heights and 172 weights are 0). "Missing weight" means `weight_kg = 0 OR weight_kg IS NULL`. The reference AVG queries do NOT exclude 0s; just use AVG(col).
- full_name: 122 NULL and 125 '-'. "Without full name" in the reference means `full_name IS NULL`.
- superhero_name is not unique (e.g. Atlas x4, Angel x2). Don't add DISTINCT unless it's clearly needed.
- 98 heroes have no powers.

## Query style of the reference SQL
- Use INNER JOINs with aliases T1=superhero, T2/T3/T4 for the lookup tables. Filter on the lookup **text** (`T2.publisher_name='Marvel Comics'`, `T3.gender='Female'`) rather than ids. Both give the same rows.
- Count heroes with `COUNT(T1.id)`. For a power count, `COUNT(T1.hero_id)` from hero_power JOIN superpower.
- Percentage:
  `SELECT CAST(COUNT(CASE WHEN T3.gender='Female' THEN T1.id ELSE NULL END) AS REAL) * 100 / COUNT(T1.id) FROM superhero T1 JOIN ... WHERE <population filter>`
  The denominator is all joined rows in the population (inner join drops NULL FKs).
- Ratio: `CAST(COUNT(CASE WHEN ..='Male' THEN T1.id END) AS REAL) / COUNT(CASE WHEN ..='Female' THEN T1.id END)`.
- Difference: `SUM(CASE WHEN x THEN 1 ELSE 0 END) - SUM(CASE WHEN y THEN 1 ELSE 0 END)`. It returns one value, not the name of the larger group.
- "X% of average": `T1.weight_kg * 100 > (SELECT AVG(weight_kg) FROM superhero) * 79`.
- Average: AVG(col), or `CAST(SUM(col) AS REAL)/COUNT(T1.id)` when the hint says SUM/COUNT.
- Superlatives (tallest, heaviest, dumbest, most durable): `ORDER BY col DESC|ASC LIMIT 1`, with no tie handling. For attributes, join hero_attribute+attribute, filter attribute_name, then ORDER BY attribute_value.
- "Most powers": `GROUP BY T1.superhero_name ORDER BY COUNT(T2.hero_id) DESC LIMIT 1`.
- "List at least five ...": add `LIMIT 5`.
- "Rank ...": `RANK() OVER (ORDER BY height_cm DESC)`, selecting name, value and rank.
- Return only the columns asked for, in the order asked ("race and alignment" gives T2.race, T3.alignment). "Name" means superhero_name unless "full name" is asked. 
- DISTINCT is used only when listing a lookup value (colour, race, power_name) that could repeat across heroes or attribute rows. Plain name lists have no DISTINCT.
- "Alphabetical order" means `ORDER BY T1.superhero_name`.
- If the hint gives an id (e.g. race_id = 21, colour.id = 7), the reference may filter by that id directly.
