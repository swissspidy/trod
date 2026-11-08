# mw "button-delay" episodes (click ONE, wait N s, click TWO)

RULES
- The episode ends on the click of TWO, and that click is the only thing graded. Do not click anything else first.
- Read the wait N from the task text every episode (N varies: 1, 2, 3 seen). Do not reuse an old value.
- Element ids and @x,y positions change on every reset. Run `mw observe` after `mw reset` and use the ids from that output; never reuse coordinates.
- The delay is measured between the two clicks. Do click ONE and click TWO in the SAME shell call, with `sleep` between them. Splitting them across separate tool calls adds model latency; that overshoot scored 0.
- Sleep about (N - 0.2) s: `sleep 0.8` for N=1 scored 1; `sleep 1.0` scored 0.6; `sleep 1.3` scored 0.35.
- For N=2 and N=3, sleep N-0.2 or N both scored 1. Undershoot badly (N=2, sleep 1.5) scored -1. Overshoot by ~1 s (N=3, sleep 4) scored 0.35.
- There is no submit button; the click on TWO ends the episode. `mw reward` after that shows the result.

RECIPE (one bash call per episode)
mw reset >/dev/null; T=$(mw observe | head -1); N=$(echo "$T" | grep -oE 'wait [0-9]+' | grep -oE '[0-9]+')
ID1=<id of ONE from observe>; ID2=<id of TWO from observe>
mw click $ID1 >/dev/null; sleep $(echo "$N - 0.2" | bc); mw click $ID2; mw reward
