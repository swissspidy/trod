# Click button ONE, wait N seconds, click button TWO
Tasks like: "Click button ONE, wait <N> seconds, then click button TWO."

## How it is scored
- Only the gap between the two clicks matters. Time spent reading or thinking before the first click costs nothing.
- Full reward needs the second click to land very close to N seconds after the first, within about ±0.25 s.
- Each `mw click` takes about 0.25 s by itself. So `sleep <N>` makes the gap about N+0.25 s, and the reward often drops to 0.6. A gap about 0.5 s or more away from N scores 0.6 or less, and can score 0 or −1.

## Recipe (one Bash call, nothing else)
Sleep for N minus 0.3 seconds:

| N in task | command |
|---|---|
| 1 | `mw click 1; sleep 0.7; mw click 2` |
| 2 | `mw click 1; sleep 1.7; mw click 2` |
| 3 | `mw click 1; sleep 2.7; mw click 2` |
| other N | `mw click 1; sleep <N-0.3>; mw click 2` |

- [1] is button ONE and [2] is button TWO (ids `subbtn`/`subbtn2`). Their positions change, but the ids do not.
- The output should end with "The episode has ended." Then reply DONE.
- This scored reward 1 in 8 of 8 practice episodes (N = 1, 2 and 3).

## Do NOT
- Do not use `sleep <N>` with the exact number from the task. It runs about 0.25 s long and got 0.6 several times.
- Do not round the sleep up "to be safe". Late clicks lose reward too.
- Do not run `mw observe` or take a screenshot between the clicks. Do not split the clicks across separate Bash calls or use a heredoc. Any extra step adds delay.
- Do not sleep much less than N-0.3. A gap that is far too short scores 0.
