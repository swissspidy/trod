# click-checkboxes-soft: notes

RULES
- Options are label + checkbox pairs. Ids (`ch0`, `ch1`, ...) and the Submit id change per episode; read them from the latest `observe` or action output.
- Clicking Submit ends the episode. Do not click it until every target is checked.
- Target = one synonym per query word, AND any option that is exactly a query word (identical counts as similar). Skipping identical-word options gave partial reward (0.2-0.5).
- Distractors are antonyms or unrelated words (like, archaic, camouflage, reply, sinful). Do not pick them; extra picks lower the score.
- Click each `input` id once. A second click unchecks it. Confirm with `observe | grep checked` before Submit.
- Use `mw reward` after Submit: 1 means solved.

RECIPE
1. `mw reset`; read the query words and option labels.
2. For each query word, pick its synonym plus any option identical to a query word.
3. `click <input id>` for each pick; `observe | grep checked` to confirm exactly those.
4. `click <submit id>`; `mw reward` should show 1.

Seen: 4 of 4 episodes solved (reward 1) when this recipe was followed; 3 partial rewards came from skipping identical-word options or picking extra items.
