# Counting and choice answers

- An answer is entered by clicking the matching button (keypad digit, sides button). Words alone fail: 077 and 083 answered in text, clicked nothing, failed.
- Count from a zoomed crop: enlarge the region of blocks or shapes (PIL crop + resize x4-8, NEAREST), then Read it. 001 counted 17 that way and passed; 002 and 003 counted 16 from a full screenshot and failed.
- Shape sides: count vertices on the enlarged image, then click the button with that number (079: heptagon -> "7", pass; 078 and 080-081 passed the same way).
- Size questions ("small", "large"): compare element widths and heights in the listing with the screenshot.
- Glyph counts ("How many 5s"): count matching text elements in the listing; the answer buttons are glyphs too, so do not count them.
- If your count matches no button, recount before deciding (083 found no "4" button and stopped).
- "Select words similar to X": tick labels that are synonyms of X (111 ticked the synonyms and passed). If none is a synonym, tick nothing and Submit (112 passed). 109 stopped before any action and failed.
