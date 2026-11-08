# stock-market notes

RULES
- Any click on Buy ends the episode. Clicking while the live price is NOT below the target scores -1.
- The price changes about every 0.2s and can jump $2-5 per tick. One `mw` call also takes about 0.2s, so the price you saw may be out of date when the click lands. Don't buy when it is only just below. Buy when price < target - 1.5 (go down to -0.8 after ~8s).
- The price feed stops after ~14s and shows "$undefined0". Clicking Buy after that scores -1. Act within ~13s of reset or first observe.
- Don't poll by hand, one tool call at a time: that is too slow. Run one bash loop that observes and clicks.
- Buy button = `button#buy`, usually id 4. The price span id changes every tick, so match on the `stock-price` text, not on its id.

RECIPE (bash, a single tool call; worked 5/5):
```
O=$(mw observe); th=$(echo "$O"|grep -o 'than \$[0-9]*\.[0-9]*'|grep -o '[0-9.]*$')
B=$(echo "$O"|grep 'button#buy'|grep -o '^\[[0-9]*'|tr -d '['); s=$(date +%s)
while :; do e=$(( $(date +%s)-s )); [ $e -gt 14 ] && break
 m=1.5; [ $e -ge 8 ] && m=0.8
 p=$(mw observe|grep -o 'stock-price "\$[0-9.]*'|grep -o '[0-9.]*$'); [ -z "$p" ] && continue
 awk -v p=$p -v t=$th -v m=$m 'BEGIN{exit !(p<t-m)}' && { mw click $B; break; }
done
```
Every task I saw said "less than $<X>". If a task says "more/greater than $<X>", flip the test to p>t+m.
