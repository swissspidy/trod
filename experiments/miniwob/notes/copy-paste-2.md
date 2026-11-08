# copy-paste-2 rules

- Clicking Submit ends the episode, right or wrong. Check the input's value with `observe` before you click Submit.
- Read the ordinal in each new task ("1st/2nd/3rd text area"). It changes every episode. The Nth text area is textarea#text-N. Don't reuse the ids from the last episode without checking.
- The answer must match the text area exactly, including its TRAILING SPACE (most values end in " ").
- DON'T use `type <id> <text>`. It drops the trailing space, so the answer is wrong (reward -1, seen twice).
- DO use the real clipboard: Control+A / Control+C in the text area, then Control+V in the input. It copies the text byte for byte (worked 4/4).
- If the input already holds wrong text, click it and press Control+A before Control+V, so the paste replaces it.

## Recipe (ids as seen; confirm with observe)
```
mw click <N>          # textarea#text-<N>, N = ordinal in the task
mw press Control+A
mw press Control+C
mw click <input id>   # input#answer-input (was [4])
mw press Control+A
mw press Control+V
mw observe            # the input's value must equal text-<N> exactly, trailing space too
mw click <submit id>  # button "Submit" (was [5]); this ends the episode
```
