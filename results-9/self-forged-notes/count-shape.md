# count-shape notes (mw)

RULES
- Each episode has one answer. Clicking an answer button is the final action: it ends the episode at once. There is no submit button. Count first, then click once.
- Right answer gives reward 1; wrong gives -1. Both end the episode.
- Answer buttons are digits in a row at y≈185 (random labels). Click the button whose label equals your count, by id from the latest observe.
- Run `mw observe` after every `mw reset`. Ids change per episode; never reuse old ids.
- The observe list is the full set of items. Optionally check with `mw screenshot f.png` and Read it.
- Match the noun exactly. "triangles" = polygon elements (any size). "shapes" = rect, circle, polygon (text does not count). "digits" = number texts.
- Glyph questions are case-sensitive: "es" = lowercase e only (E does not count); "Is" = capital I only; "0s" = digit 0; "ts" = lowercase t.
- Colour words match the fill attribute exactly ("black", "magenta", ...). Ignore items of other fills.
- "small" = height-11 text (e.g. 6x11, 7x11) or 10x10 shapes. "large" = height-22 text or 20x20 shapes. Only these two sizes appeared.
- Ignore distractors that fail any part of the question (e.g. a red "a" when asked about black items).

RECIPE
1. mw reset; mw observe
2. Count elements matching noun + colour/glyph + size from the list.
3. mw click <button id labelled COUNT>; mw reward  -> expect reward 1.
