# Counting tasks

## "How many small items / large shapes / 5s / small digits are there?"
- Count only the items in the drawing area: `text`, `rect`, `circle`, `polygon`. **Never count the answer buttons** at the bottom, `button "N"` near y≈185.
- "small" and "large" mean drawn size: small ≈ 10x10 shapes and 6x11 glyphs; large ≈ 20x20 shapes and 11x22 glyphs. They do **not** mean digit value. One session read "small digits" as 0–4 and counted buttons.
- "shapes" means rect/circle/polygon, "digits" means text 0-9, "letters" means text a-z. "items" means all of them.
- Answer by clicking the `button` whose label is your count. That click ends the task. Not clicking is a fail.

## "Press the button that denotes how many sides the shape has"
- Take a screenshot and zoom in (general rule 7). Count the vertices, then click the matching button (3–7).

## "Type the total number of blocks into the textbox and press Submit"
- Take a screenshot, then **crop around the two block groups and upscale ×5** before counting. Low-res reads disagreed with each other.
- Then run `type <math-answer id> <sum>` and `click <Submit id>`.
