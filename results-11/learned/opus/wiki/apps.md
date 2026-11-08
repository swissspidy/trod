# Mini apps

## Email inbox (forward / reply / mark important; 054–056 passed, 053 failed)
- `click <sender's row>` opens the email. The action buttons in the opened view then get ids (e.g. reply/forward).
- Send is a paper-plane icon with no id: `clickxy 147 61`, as seen in a screenshot.
- The important star in the open email's header is at about `clickxy 133 62`.
- For "all of X's emails", check the whole list (hover lower rows) before acting.

## Daily calendar ("Create a <N> mins event named "<name>", between <A> and <B>")
- Dragging on the grid opens a "New event" popup. The event covers every 30-min slot the drag touches, about 20.5px per slot.
  - 19px gave 30 min.
  - 41px gave 90 min.
  - 62px gave 2 h.
- Recipe (076 passed):
  1. Use the hour-label @y values to find the start slot.
  2. `dragxy <x> <y in first slot> <x> <y in last slot>`.
  3. Read the times shown in the popup.
  4. If they are wrong, cancel and redraw.
  5. `type <name id> <name>`, then `click <Create>`.
- 057 ran out of actions; 067 never clicked Create.

## Order food ("Order N items that are <diet>" / "one of each: A, B")
- `click <span.add "+" id>` per unit. Check the `span.quantity` values, then `click <Order! button>`.
- Named items: this worked directly (032).
- Diet: the only cue is the coloured badges under the names. There is no legend.
  - Vegan: taking items with only the green-leaf badge passed (026, 031).
  - Gluten-free: 030 guessed green sprig = wheat and failed.
  - Zoom into the badges before choosing.

## Buy stock ("Buy <SYM> when the price is less than $<P>")
- The price `span#stock-price` shows up in the observation after `mw screenshot` or `mw observe`.
- If it is already below P, `click <Buy>` (016–018 passed).
- 013 saw it above P, waited, then gave up without buying and failed.
- If the price is above P, keep polling with short separate calls (`sleep 3`, then `mw observe | grep stock-price`). Click Buy when it drops below P. Never end without buying.
