# hot-cold: "Find and click on the HOT area"
Layout: blank box ≈ x 3-157, y 53-178. Signal div below it shows ICE COLD/COLD/WARM/HOT for the mouse position.

RULES
- ANY click (clickxy, or a drag that starts and ends at the same spot) ends the episode. Click once, at HOT center.
- Use dragxy to move the mouse (there's no hover-by-coordinates). Drags that START outside the box don't update the signal.
- FIRST action: warm up with `mw dragxy 80 115 80 20` (inside→outside). Without it, the first inside→inside drag counts as a click (reward -1).
- Probe P=(x,y) with `mw dragxy x y x y+10` (use y-10 if y>150). A drag far away (e.g. to y=30) gives readings shifted by up to 10px. Clicking there scored only 0.25-0.5.
- HOT spot is small (≈8px wide). WARM ≈ ±8px, COLD ≈ ±40px, everything else ICE COLD.
- Reward depends on how close the click is to the center: find the edges of the HOT region and click the midpoint. Got 1.0 in 8/8 tries.

RECIPE (bash)
pr(){ e=$(( $2>150 ? $2-10 : $2+10 )); mw dragxy $1 $2 $1 $e | grep -o '"[A-Z ]*"'; }
1. mw dragxy 80 115 80 20
2. Coarse grid: for y in 60 90 120 150 172; x in 15 45 75 105 135 152: pr x y. Stop at the first COLD/WARM/HOT.
3. Probe around the best point in steps of ~10, then 3. If stuck at COLD, grid ±30 in steps of 10. Move toward WARM, then HOT.
4. From a HOT point, step ±2 in x until it stops reading HOT → cx=(left+right)/2. Then at cx, step ±2 in y → cy.
5. mw clickxy <cx> <cy>   (single final action)
