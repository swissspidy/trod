# count-sides — rules

- The shape is NOT in the element list (only number buttons show). ALWAYS run `mw screenshot <file>.png` and Read the image before clicking.
- ONE click on any number button ends the episode: right = reward 1, wrong = reward -1. No submit, no retry. Don't click to "explore".
- Shapes seen: regular polygons, randomly rotated, 3 to 7 sides (triangle, pentagon, heptagon seen). Buttons seen: "3".."7".
- Count VERTICES (corners) one by one going around the outline, writing approximate pixel coordinates of each, rather than guessing from overall look. 6 vs 7 and 5 vs 6 look alike when rotated — the heptagon is the main trap.
- Click by the id whose LABEL equals your count (ids [1]-[5] were "3"-"7" every time, but check the list, since ids != numbers).
- Coordinates like `@24,167` in the list are button positions; `click <id>` is reliable, no need for clickxy.

## Recipe
1. `mw screenshot /tmp/s.png` → Read /tmp/s.png
2. List each corner of the shape (e.g. top, upper-right, right, ...) → N = number of corners
3. `mw click <id of button labelled N>` (done; episode ends)
