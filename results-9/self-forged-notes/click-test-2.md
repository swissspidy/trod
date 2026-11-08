# click-test-2 notes

## RULES
- The episode ends at the first click on a wrong target: reward -1. Only click once you are sure of the target.
- Your first click is the final action. Do not click anything else "to look around"; `observe`, `screenshot`, `reward` do not end it.
- Read the target label from the task text (e.g. "Click button ONE."), then click the id whose label matches exactly. Do not pick by position or by id number alone.
- Element ids (`[n]`) and @x,y positions change between episodes (same ids, different coordinates). Never reuse coordinates from an earlier episode; use `click <id>` from the current listing.
- Run `mw reset` first, then read the listing it prints (or `mw observe`) before clicking. The listing from the latest observation is the one that counts.
- Do not use `clickxy` or `screenshot` unless the element list is missing the target; both are slower and unnecessary here.
- Do not click decoy buttons (e.g. "TWO") while looking for the target.
- No submit button or hover was needed: a plain `click` on the matching button solved the episode.
- Check `mw reward` after the click: reward 1 with "episode ended" means solved.

## Recipe (worked 3/3)
1. `mw reset`
2. Read the task label, e.g. `<TARGET_LABEL>`, and find the line `[<id>] button#... "<TARGET_LABEL>"` in the listing.
3. `mw click <id>`
4. `mw reward` -> expect `reward 1 (episode ended)`.
