# Mini apps

## Email inbox (forward / reply / mark important / delete)
- `click <sender's row>` opens the email; Reply/Forward then get ids.
- Icons have no id (screenshot, `clickxy`): Send (paper plane) ≈ `147 61`; important star in the open email's header ≈ `133 62`; trash sits in the same red header.
- Wording is loose: "emails I sent to X" and "message from X" both mean the rows whose sender is X. 055 refused to delete a "to me" email from X and failed.
- For "all of X's emails", check the whole list (hover lower rows) first.

## Daily calendar ("Create a <N> mins event named "<name>", between <A> and <B>")
- A drag on the grid covers every 30-min slot it touches (≈20.5px per slot: 19px = 30 min, 41px = 90 min).
- Recipe: find the start slot from the hour-label @y; `dragxy <x> <y first slot> <x> <y last slot>`; read the popup times (cancel and redraw if wrong); `type <name id> <name>`; `click <Create>`.

## Order food ("Order N items that are <diet>" / "one of each: A, B")
- `click <span.add "+" id>` per unit, check `span.quantity`, then `click <Order!>`.
- Diet is shown only by badges (zoom first): vegan = green leaf only; dairy = blue carton (passed). Green sprig ≠ gluten-free (failed).

## Buy stock ("Buy <SYM> when the price is less than $<P>")
- The price moves between calls: 016 saw $49.70 < $50.90, clicked Buy in the next call, and failed. Check and buy in ONE Bash call:
  `p=$(mw observe | grep -o 'stock-price "\$[0-9.]*' | grep -o '[0-9.]*$'); echo $p; awk "BEGIN{exit !($p < <P>)}" && mw click <Buy id>`
- Repeat that call (add `sleep 2;` in front) until it buys; the price drifts down.
- The price often turns into "$undefined0" and stays (013, 014 waited it out and failed). Once it shows undefined, click Buy anyway. Never end without buying.
