# stock-market (mw) notes

Task: "Buy <SYM> stock when the price is less than $T". Goal: click Buy (`button#buy`, id 4 in every episode so far; read it from observe) while the shown price is below T.

RULES
- Clicking Buy with price >= T ends the episode with reward -1 (verified). Never click until the parsed price is < T.
- Clicking Buy with price < T ends the episode with reward 1 (solved). No submit step is needed.
- The price feed is valid only ~10 s after `mw reset`; then `#stock-price` shows "$undefined0" forever. Act right after reset; don't observe or screenshot first.
- The price is a random walk (~±1 per 0.2 s). It can start above T and dip later, so poll rather than click once.
- `mw observe` prints ~100 chart circles. Filter with grep/sed; don't read it raw.
- Price line: `span#stock-price "$47.70"` (quote before $). A regex with `stock-price"` matches nothing.
- The price span is sometimes missing from one observe; treat that as "not yet", not failure.
- An observe takes ~0.2 s, so a bash loop reacts fast enough.
- If the feed is already undefined with no dip, `mw reset` for a new episode.

RECIPE (4/4 solved this way or manually)
1. `mw reset`
2. Immediately, in ONE bash command, loop up to ~45 times: `o=$(mw observe)`; T from `less than \$([0-9.]+)`; P from `stock-price "\$([0-9.]+)"`; b from `button#buy`. If P < T: `mw click $b`; break.
3. `mw reward`: 1 = solved.
