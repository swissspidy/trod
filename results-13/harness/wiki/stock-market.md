# Buy stock below a price (fast-moving price)
Tasks like: "Buy <SYM> stock when the price is less than $<LIMIT>."

Facts (tested):
- The price changes about every 0.25 s, sometimes by ±3. A price you read in one call is stale by the next call.
- The price series lasts only about 10 s from episode start. After that it shows "$undefined0", and clicking Buy then gives -1. Every extra turn eats this time.
- The price is often already below the limit at the start, so act at once.

Recipe: make your FIRST mw call this single Bash command. Put the limit number from the task in place of <LIMIT>, with no `$` and no trailing period. Buy is `[4]` (`button#buy`).
```
L=<LIMIT>; for i in $(seq 40); do p=$(mw observe | grep -o 'stock-price "[^"]*' | cut -c15-); echo -n "$p "; case "$p" in *undefined*) break;; esac; [ -n "$p" ] && awk "BEGIN{exit !($p <= $L - 1)}" && { mw click 4; break; }; done; mw observe | head -2
```
It buys at the first price at least $1 under the limit. The $1 margin covers the price moving between reading and clicking (this went 13/13). Seeing "The episode has ended." means it is done: reply DONE.

Do NOT:
- take a screenshot, read other wiki pages or run a separate `mw observe` before the loop. Haiku failed twice by reading the price in one call and clicking in the next, though the price it read was below the limit.
- buy when the price is only a little under the limit (a 0.9 margin failed).
- click Buy on "$undefined0": that gives -1, despite what the general notes say.
- add `sleep` to the loop. Poll as fast as possible.
- parse the limit with `[0-9.]*` straight from the task text: it picks up the trailing period.
If the loop ends without buying (the price never went low enough), do not click Buy. Reply DONE.
