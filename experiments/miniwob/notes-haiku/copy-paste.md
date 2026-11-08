# copy-paste task: notes

RULES
- The task text does not say to submit, but the episode only ends (and scores) at the Submit click. Always finish with a click on the Submit button.
- Element ids are NOT fixed between episodes. The textarea, input and Submit swap positions (textarea was id 1 in some episodes and id 2 in others). After every `mw reset`, run `mw observe` and read the ids from that output before acting.
- Never reuse ids from a previous episode or from a layout you remember. In one run I clicked a stale id, pasted into the textarea, and submitted: reward -1, episode ended.
- Do not submit until `mw observe` shows the input's value equal to the textarea's value (the copy is complete, including the trailing space).
- Copy with the keyboard, not by reading the text. Clipboard copy and paste worked every time.
- `mw reward` is 0 while the episode runs. It becomes 1 or -1 once the Submit click ends the episode.
- Do not call `mw reset` before the episode has ended, because reset discards the current attempt.
- Screenshots are not needed; `mw observe` shows all values.

RECIPE (worked 3 times in a row, reward 1 each)
1. `mw reset` then `mw observe`. Note the ids: <TA> = textarea#to-copy, <IN> = input#answer-input, <SUB> = button#subbtn.
2. `mw click <TA>`; `mw press Control+A`; `mw press Control+C`
3. `mw click <IN>`; `mw press Control+V`
4. `mw observe` and check that input value = textarea value.
5. `mw click <SUB>`; `mw reward` should report reward 1 (ended).
