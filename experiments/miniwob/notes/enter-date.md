# enter-date notes

The page has a native `input type="date"` [1] (shown as mm/dd/yyyy) and a Submit button [2].

RULES
- Clicking Submit ALWAYS ends the episode. If the date is empty or wrong, you get -1. Check the value first.
- Do NOT use `type <id> <text>`. It clicks the middle of the input, so every digit lands in the YEAR segment (for example "01/28/2011" became "mm/dd/282011"). The ISO form 2011-01-28 fails the same way.
- Instead, use `clickxy` on the MONTH segment at the left edge of the input: x = input_x+11, y = input_y+10. With the input at @7,62 that is `clickxy 18 72`. Then `press` the 8 digits one at a time, as MMDDYYYY with no slashes. The cursor moves to the next segment by itself.
- Always type 2 digits for month and day (zero-pad them: 4 -> 04).
- Before you submit, run `observe`. The input should show value="YYYY-MM-DD" matching the task. If it is wrong, click the month segment again and re-press all 8 digits; that overwrites the old value (checked).

RECIPE (solved 4 of 4 tries)
```
mw clickxy 18 72          # month segment; adjust if the input's @x,y differs
for k in <M> <M> <D> <D> <Y> <Y> <Y> <Y>; do mw press $k; done
mw observe                # expect value="<YYYY>-<MM>-<DD>"
mw click 2                # Submit (final)
```
Example: for 10/13/2018, press 1 0 1 3 2 0 1 8.
