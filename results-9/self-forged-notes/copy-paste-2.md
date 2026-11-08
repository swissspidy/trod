# copy-paste-2 notes

RULES
- The task text names the source: "Nth text area" = `textarea#text-N`. Read the ordinal from the task line after every `mw reset`; it changes between episodes (seen 1st and 2nd).
- Do not assume the source is text-1. Run `mw observe` first and use the ids it prints (ids and layout were the same across the 3 episodes I played).
- Copy with the keyboard, not by retyping. Exact text (including trailing space) is what gets scored.
- The episode ends at the Submit click. Do all copying and pasting first, and check that `input#answer-input` shows the right value before clicking Submit.
- Submit is required. Pasting alone does not solve it; `mw reward` stays 0 until `button#subbtn` is clicked.

RECIPE (works every time, 3/3 episodes)
1. `mw reset`, then `mw observe` and read the ordinal in the Task line.
2. `mw click <N>` on the source textarea (N = ordinal, text-N).
3. `mw press Control+A`, then `mw press Control+C`.
4. `mw click 4` (input#answer-input). Check the element id in observe output first.
5. `mw press Control+V`. The input's value should now equal the source text.
6. `mw click 5` (button#subbtn, Submit). The episode ends.
7. `mw reward` should print reward 1 (episode ended).

NOTES
- Each action prints the full element list; only the final value line matters.
- The `reset` output shows the element list once. Read it there before acting.
