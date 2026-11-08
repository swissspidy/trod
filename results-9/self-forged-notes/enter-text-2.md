# enter-text-2 notes

RULES
- Read the task text first with `mw observe`. The word and the case rule come only from it. Never type a word from memory or a guess.
- Apply the case rule: "all lower case" means lowercase, "all upper case" means UPPERCASE. Typing "TULA" when lowercase was required gave reward -1.
- The word and case change every episode (seen: TULA, CHAS, LIVIA, ENOLA, DOLORES, RENDA). Re-read the task after every `mw reset`.
- `mw type 1 <text>` (input `input#tt`) clears and types. It is reliable; no separate clear step is needed.
- Run `mw observe` after typing and confirm `value="..."` has the right case before submitting.
- Submit is `mw click 2` (`button#subbtn`). It ends the episode at once, so a wrong value is final (reward -1).
- Use element ids, not coordinates. Ids stay the same across episodes; coordinates move.
- `mw reward` before submit says "episode still running". After submit it shows the result.

RECIPE
1. `mw reset`
2. `mw observe`; note <WORD> and <CASE> from the task text.
3. `mw type 1 <WORD in CASE>`
4. `mw observe`; confirm value="<WORD in CASE>".
5. `mw click 2`; `mw reward` should show 1.

Practice: 4 solved (LIVIA, CHAS, DOLORES, RENDA). 2 failed, both from typing before reading the task.
