# count-sides (mw)

Task text: "Press the button that correctly denotes how many sides the shape has."

RULES
- The episode ends on the first click of an answer button. There is no submit step and no retry: `mw click <id>` ends it and `mw reward` then shows reward 1 if correct. Do not click until you are sure.
- Do not guess from the small thumbnail in the observation. Run `mw screenshot /tmp/epN.png`, then Read the PNG to see the shape.
- The shape is small (~70px). If corners are hard to count, enlarge it first: crop the shape region (roughly x 30-125, y 55-145 in the screenshot) and resize it by 6x with PIL (`python3 -I`), then Read the result. Count vertices, not edges.
- Shapes can be irregular or stretched (a triangle with an uneven side, a pentagon that is not regular). Count corners only; do not judge by appearance.
- Button ids in the observation looked stable across episodes: 1="3", 2="4", 3="5", 4="6", 5="7". Still read the labels in each observation before clicking.
- Each `mw reset` starts a new instance of the task; check `mw reward` after the click to confirm.

RECIPE (worked 4/4)
1. `mw reset` (skip on the first episode if already running).
2. `mw screenshot /tmp/ep.png`, then Read it.
3. Count the corners of the shape: <N>.
4. `mw click <id of button labelled N>`.
5. `mw reward` → expect "reward 1 (episode ended)".

Observed: triangle→3, pentagon→5 (x2), heptagon→7.
