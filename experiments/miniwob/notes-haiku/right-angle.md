# right-angle task (mw)

RULES
- Submit ends the episode. Place and check the third point before clicking Submit.
- Submit with no third point gives -1. A point off the canvas, or not a right angle at blue, also gives -1.
- The right angle must be at the BLUE point (`init-blue`): (P - blue) · (black - blue) = 0.
- Right angles at the black vertex are unreliable (about +0.5 once, -1 otherwise). Do not use them.
- Positions come from `mw observe`. For a 7x7 dot, center = @x,y + 3.5.
- Place the point with `mw clickxy <x> <y>` on the canvas (roughly x 0-160, y 50-175, above Submit).
- A second clickxy replaces the third point; it does not add a fourth. You can re-click to correct.
- Ids change as points are added (Submit was [4], then [3]). Re-observe and use the id of `button#subbtn`. A stale id does nothing.
- After submit, `mw reward` > 0 means solved. Successful runs gave 0.92-0.99.
- `mw reset` gives a new layout; re-read positions each time.

RECIPE (landed on canvas: 10 of 10 succeeded)
1. `mw reset`, then `mw observe`. B = black @ + 3.5, L = blue @ + 3.5.
2. d = B - L. P = L + (-dy, dx), the perpendicular at blue with leg |BL|.
3. If P is off the canvas, use P = L + s*(-dy, dx) with s = 0.8, 0.6, 0.5, or L - (-dy, dx).
4. `mw clickxy <round(Px)> <round(Py)>`.
5. `mw observe`, take the id of `button#subbtn`, then `mw click <id>`.
6. `mw reward`. Done when > 0.
