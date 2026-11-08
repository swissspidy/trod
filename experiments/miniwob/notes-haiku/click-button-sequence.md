# click-button-sequence ("Click button ONE, then click button TWO.")

RULES
- Positions change every episode (`mw reset` gives a new layout). Always run `mw observe` first and use the ids it prints for the current episode; never reuse ids or coordinates from an earlier episode.
- Element ids are the bracket numbers, e.g. `[1] button#subbtn "ONE"` -> `mw click 1`. Match on the label text ("ONE"/"TWO"), not on the number's position in the list.
- Click ONE first, then TWO. Nothing else is needed: no submit button, no hover, no waiting. Each click is applied immediately.
- The episode ends on the click of TWO (after a correct ONE). Reward then shows `1`. Do not click TWO before ONE: a wrong click followed by ONE ended the episode with reward -1.
- Do not click anything extra after TWO; the episode is already over ("The episode has ended.").
- Use `mw reward` after the final click to confirm (reward > 0 = solved, "episode ended").
- Do not use `dblclick`, `clickxy` or drag for this task; plain `click <id>` works.

RECIPE (worked 4/4 episodes)
1. `mw reset` (only if the previous episode ended or you want a fresh one)
2. `mw observe` -> read ids for ONE and TWO from the output.
3. `mw click <id_ONE>`
4. `mw click <id_TWO>`
5. `mw reward` -> expect `reward 1 (episode ended)`.
