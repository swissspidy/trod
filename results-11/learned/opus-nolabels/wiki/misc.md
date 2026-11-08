# Other small tasks

## Click buttons ONE / TWO
- `mw click <id of "ONE">`, then `mw click <id of "TWO">`, using ids, not coordinates. For "wait N seconds", put `sleep N` in its own Bash call between them. Don't run it in parallel with the next click.

## Tic-tac-toe (play X and win)
- The listing has no elements. Use `clickxy` on cell centres: columns x≈33/78/122, rows y≈83/127/171. O may already be on the board.
- After each move, take a screenshot and Read it. Win if you can, otherwise block O's two-in-a-row, otherwise create a fork. The episode ends on a win.

## Buy stock when price < $P
- The price shows as `span#stock-price` in the listing after any `mw` call (e.g. `mw observe`). It changes over time.
- If it's already below P, `click <Buy id>`. If not, poll `mw observe | grep stock-price` with `sleep` ≤20 in between, and buy as soon as it's below P.

## Keep the mouse hovered over the colored square
- Run `hover <id of rect#highlight>` straight away, using the id from the **current** listing (ids move between observations). There's no submit; the episode ends on its own.

## Find and click on the HOT area
- No elements are listed, and the first click inside the task area ends the episode. Sessions guessed the box centre and the outcome is unknown. Before clicking, look in the screenshot for colour or text hints.

## Order food ("Order 4 items that are vegan", "one of each: A, B")
- Use `click <span.add id>` for each item, then check `span.quantity` in the listing. The ids stay stable even though the page scrolls. Click `Order` (the last id) to finish.
- Dietary tags appear only as small coloured icons. Zoom the screenshot to read them.
