# count-shape notes

RULES
- Clicking ANY number button ends the episode at once (no submit, no undo). Count first, click once.
- Don't need screenshots: `mw observe` lists every item with type, fill colour and size. Count from that list.
- Size: SMALL = text height 11 (e.g. 6x11, 7x11, 2x11) or shapes 10x10. LARGE = text height 22/23 or shapes 20x20. Use the height, not the width.
- "items" = everything above the buttons (text + shapes). Don't count the buttons.
- "shapes" = only non-text elements (circle, rect, polygon). Letters/digits are NOT shapes.
- "triangles" = polygon (seen as triangles in screenshot).
- "letters" = text items that are a-z/A-Z only; digits are NOT letters. "digits" = text 0-9.
- "How many Xs" (e.g. "es", "Is", "7s") = text equal to X, CASE-SENSITIVE: "es" counts only "e", not "E" (counting both failed).
- Colour words match fill= exactly (red, blue, aqua, magenta, green, yellow, black).
- Combine every filter in the question (size AND colour AND kind), e.g. "small magenta items" = fill magenta with height 11/10.

RECIPE
1. `mw observe`
2. Keep the items that match <size> (height 11/10=small, 22/20=large), <colour> (fill=) and <kind> (items / shapes / letters / digits / triangles / exact char, case-sensitive).
3. `mw click <id of button whose label = count>` (one click, done).
