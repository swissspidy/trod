# use-autocomplete notes

RULES
- Read the Task line from `mw observe` after every `mw reset`. Start/end letters change per episode (seen: "Slo", "Niue...Niue", "Bo...ia", "Urug...uay", "Sw...land"). Don't reuse an old answer.
- Submit is what ends the episode and scores it. Clicking a suggestion alone does nothing for the score; submit afterwards.
- The open suggestion list covers the Submit button. Clicking Submit while it is open only closes the list and the episode keeps running. Run `mw press Escape` first (or click a suggestion), then click Submit.
- Escape keeps the typed value. Check `value=` in observe before submitting.
- `mw type <input> <text>` replaces the field's content. Type the exact spelling shown in the list.
- Element ids renumber on every observe; use the ids from the latest output (input was [2], Submit [3] every time).
- Two or three letters show the list; "N results are available" gives the count. Pick the item whose end also matches the task.

RECIPE (worked 5 of 5)
1. `mw reset`; `mw observe`; note: starts with "<P>", ends with "<S>".
2. `mw type 2 <first 2-3 letters of P>`; `mw observe`.
3. Choose the item that starts with <P> and ends with <S>; copy its exact spelling.
4. `mw type 2 <exact item>`; `mw press Escape`; `mw observe` to confirm value.
5. `mw click 3`; `mw reward` should show "episode ended", reward 1.
