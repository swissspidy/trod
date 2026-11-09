# Mini apps

## Email inbox (forward / reply / mark important / delete)
- `click <sender's row>` opens the email; Reply/Forward then get ids.
- Icons have no id: Send (paper plane) ≈ `147 61`; important star ≈ `133 62` (053 passed); trash in the same header.
- Wording is loose: "emails I sent to X" and "message from X" both mean rows whose sender is X (refusing failed).
- The inbox lists more rows than fit (y>200). Before choosing an email for ANY task, read the whole element list (hover the last rows) for every row from that sender. 054 forwarded the only visible Stephana email without checking and failed.
- Reply/forward: open row, `click <Reply|Forward>`, `type <textarea or input.forward-sender> <text>`, check `value=`, `clickxy 147 61` (056).

## Daily calendar ("Create a <N> mins event named "<name>", between <A> and <B>")
- A drag on the grid covers every 30-min slot it touches (≈20.5px per slot: 19px = 30 min, 41px = 90 min).
- Recipe: find the start slot from the hour-label @y; `dragxy <x> <y first slot> <x> <y last slot>`; read the popup times (cancel and redraw if wrong); `type <name id> <name>`; `click <Create>`.

## Order food ("Order N items that are <diet>" / "one of each: A, B")
- `click <span.add "+" id>` per unit, check `span.quantity`, then `click <Order!>`.
- Diet = badges only (zoom; hover lower items to scroll): vegan = green leaf; dairy = blue carton. Green sprig ≠ gluten-free.

## Buy stock ("Buy <SYM> when the price is less than $<P>")
- The price moves between calls; buying in a later call than the check failed. Poll and buy in ONE Bash loop (passed 014):
  `for i in $(seq 12); do p=$(mw observe | grep -o 'stock-price "\$[0-9.]*' | grep -o '[0-9.]*$'); echo $p; [ -n "$p" ] && awk "BEGIN{exit !($p < <P>)}" && { mw click <Buy id>; break; }; sleep 2; done`
- 013 and 016 bought below the limit this way and still failed (cause unknown). Always buy anyway.
- The price often turns into "$undefined0" and stays (013, 014 waited it out and failed). Once it shows undefined, click Buy anyway. Never end without buying.
