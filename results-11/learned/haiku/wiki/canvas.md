# Canvas, geometry, hover, board games

Right angle ("Add a third point to create a right angle, then press submit"):
- Existing points are in the listing: `circle#init-black`, `circle#init-blue`, 7x7 each. Centre = (x+3.5, y+3.5).
- Third point C must satisfy (A-C)·(B-C)=0: put C on the circle whose diameter is AB. Compute C exactly, `clickxy` it once, check the listing for an extra point, then Submit.
- 028 computed the point and passed. 025 and 027 eyeballed it, 2px and about 2 degrees off, and failed. The tolerance is unknown, so aim exact.

Draw a circle (058-061, all failed):
- `dragxy` makes one straight stroke, and each new drag replaces the last. Eight-segment polygons left one segment. Not solved in any session. Limit it to a few tries, then Submit the best attempt; the sessions that stopped without Submit failed for sure.

Hover ("Keep the mouse hovered over the colored square", 033-038, 0 of 5 passed):
- The coloured rect moved between captures (033 jumped on each hover). Each session hovered once and replied DONE. Untested: how long to hold. Re-screenshot right before the final action and confirm the mouse is on the coloured rect.

HOT area ("Find and click on the HOT area", 035, 037, 039, 040):
- No element ids. The screenshot shows a yellow banner and a bordered white box. The one pass clicked the box centre (80,105); the fails clicked (80,110), (80,115). Screenshot first and look for a coloured hot spot before clicking.

Tic-tac-toe (you are X; board has no ids):
- Cell centres: x in {33, 78, 122}, y in {83, 127, 171}. Passes (005, 010, 012) took the centre, blocked O's corners, then completed a diagonal. The fail (011) only blocked and drew.
- Each turn: win if you have two in a row; else block O's two; else make a double threat; else centre, then corners. Screenshot after each O move.
