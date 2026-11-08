# click-button-sequence — rules

- Run `mw observe` first. There are two buttons, labeled "ONE" and "TWO", at random positions that sometimes overlap. Choose each button by its label text, not by its position. The ids have so far been [1]=ONE and [2]=TWO, but check that each time.
- Click the buttons in the order the task gives. The order is ONE, then TWO.
- Do NOT click TWO first. Doing so does not end the episode right away, but it ruins it: clicking ONE next ended the episode with reward -1. There is no recovery.
- Clicking ONE does not end the episode (reward 0, still running). Clicking TWO after it ends the episode with reward 1.
- No submit button, hovering or waiting is needed. A plain `mw click <id>` works. Overlapping buttons did not cause problems, because clicks by id hit the right button.
- Click each button exactly once. Do not test-click anything.

## Recipe (worked 4 times out of 4)
```
mw observe                  # find the ids of "ONE" and "TWO"
mw click <id of ONE>
mw click <id of TWO>        # ends the episode, reward 1
```
