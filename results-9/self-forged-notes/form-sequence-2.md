# form-sequence-2 notes

RULES
- The episode ends on the first click of the Submit button (`button#subbtn`). Do all the edits first; any submit ends it with reward 1 if the form matches the task, so check before clicking.
- The task text does not say to submit, but reward is only given after Submit is clicked; reward stays 0 until then.
- Radio buttons: `click <id>`. Radios 1, 2, 3 are ids 1, 2, 3. A click checks it and unchecks the others.
- Textboxes: `type <id> <text>`. Ids 4, 5, 6 are the 1st, 2nd, 3rd textbox. `type` clears the field first; negative numbers such as `-5` worked.
- Ids come from the latest observation. They matched in every episode I played, but re-read the list after each `reset`; the layout may change.
- Before submitting, run `mw observe` and confirm the radio shows `checked` and the textbox shows `value="<N>"`.

RECIPE (worked 3 times in a row, reward 1 each)
1. `mw reset`; read `Task:` line for the radio index <R>, the number <N>, and the textbox index <T>.
2. `mw click <R>` (radio id = R, 1..3).
3. `mw type <T+3> <N>` (textbox id = 3 + T, so 1st->4, 2nd->5, 3rd->6).
4. `mw observe` and check the radio shows `checked` and textbox shows `value="<N>"`.
5. `mw click 7` (Submit). `mw reward` should show reward 1 and ended.
