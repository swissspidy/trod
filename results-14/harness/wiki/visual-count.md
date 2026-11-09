# Counting / visual answer tasks

The answer is submitted by clicking an answer button or pressing Submit.
- Session 077 worked out the right count (3), and a "3" button existed. It replied DONE without clicking and failed.

## "How many small/large <items|shapes|digits|letters|N>s are there?"
- Use the element list, not just the picture. The items are `text`, `circle`, `rect` and `polygon` with sizes.
  - small: about 10x10 shapes, or glyphs about 6x11
  - large: about 20x20 shapes, or glyphs about 11x22
- "small digits" means digits drawn small. It does NOT mean digit values 0–4; that misreading failed 083.
- The `button` rows at the bottom (y≈185) are the answer choices. Do not count them as items.
- Count the matches, then `click <button whose text is the count>`.

## "Type the total number of blocks…" (visual addition)
1. `mw screenshot page.png`, then Read it.
2. Crop the two block groups and zoom them, then Read the zoom:
   `python3 -c "from PIL import Image;Image.open('page.png').crop((0,60,160,125)).resize((800,325),Image.NEAREST).save('zoom.png')"`
3. Count each group row by row. The unzoomed reads that failed were off by one.
4. Run:
```
mw <<'EOF'
type 2 <sum>
click 3
EOF
```

## "Press the button that … how many sides the shape has"
- Screenshot, count the vertices, then `click <button with that number>`.
- Buttons 3–7 are ids 1–5. All three sessions that clicked once passed.
