# enter-date (mw) notes

RULES
- The target date changes every episode. Read it from the `mw reset` output ("Enter MM/DD/YYYY ..."). Never reuse digits from an earlier episode: a wrong submit ends the episode with reward -1.
- Input [1] is a segmented mm/dd/yyyy date field. Do NOT use `type 1 <text>`: it clicks the centre (lands in the year segment) and mangles text. `type 1 2018-04-01` gave "180401"; `type 1 04/01/2018` gave "12018".
- Focus the month segment with `clickxy 18 72` (left edge of input [1] at @7,62, 125x21), then send digits one `press` each, no separators: MMDDYYYY, e.g. 02/28/2011 -> press 0,2,2,8,2,0,1,1. Segments auto-advance.
- Check before submitting: `observe` shows input [1] as value="YYYY-MM-DD". It must match the task date.
- Submit is `click 2` (button "Submit"). That click ends the episode; no Enter needed. Don't click it before the value matches.
- `mw reward` = 1 means solved; 0 while running; -1 after a wrong final action.

RECIPE (worked 3 times in a row, reward 1)
  mw reset > r.txt; D=<date from r.txt>; mw clickxy 18 72
  for k in MM DD YYYY digits: mw press $k
  mw observe   # confirm value="YYYY-MM-DD"
  mw click 2; mw reward
