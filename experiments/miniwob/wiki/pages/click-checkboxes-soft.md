# click-checkboxes-soft — RULES

- Clicking Submit ENDS the episode immediately. Tick every box first, then click Submit once.
- Each target word in the task has exactly ONE matching checkbox: that word itself or a synonym
  (furious→mad, automobiles→car, halt→stop, old→aged, vermillion→red, scared→terrified,
  small→mini/little, pig→swine). Plurals map to the singular (flames→flame).
  So tick exactly as many boxes as there are words in the task.
- Some boxes are distractors (e.g. dumb, home, quiet, carve, fleshy when "fat" isn't asked).
  Don't tick them: a wrong or extra box only gets partial credit (0.5–0.6), not 1.0.
- Clicking either the label or the input#chN checkbox toggles it. Clicking again unticks it.
  Check that "checked" shows in the output before you submit.
- No timing tricks, scrolling or hovering needed. Before Submit the reward stays 0, and the
  episode keeps running while you tick boxes.

## Recipe (worked 8/8 times, 1.0 each)
1. `mw observe`. Read the task words <w1..wn> and each label/checkbox pair.
2. For each <wi>, find the label that is the same word or a synonym. Then `mw click <checkbox id>`.
   (Tip: you can loop over the ids, e.g. `for i in <ids>; do mw click $i; done`.)
3. Check that exactly n boxes show `checked` and that they're the right ones.
4. `mw click <Submit button id>` (button#subbtn, it's the last element).
