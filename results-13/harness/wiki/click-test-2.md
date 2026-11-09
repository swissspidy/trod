# Click button ONE (two buttons, ONE and TWO, at random spots that can overlap)
Tasks like: "Click button ONE."

## Why sessions failed
`mw click 1` clicks at the CENTRE of button ONE. The two buttons are placed at random and often overlap. TWO is drawn on top, so when it covers ONE's centre the click lands on TWO. The page still prints "The episode has ended.", but the reward is -1. The same click passes when the buttons don't overlap, so it is a coin flip.

## Recipe (passed 40 of 40 in a row, 6 of them overlapping, reward 1 each)
Use the keyboard, which works wherever the buttons are. Run this ONE Bash call and nothing else:
```
mw <<'EOF'
press Tab
press Enter
EOF
```
The first Tab focuses ONE (it comes first in page order), and Enter presses it. Expect "The episode has ended." Then reply DONE.
- No `observe` or screenshot is needed beforehand. Every extra call costs time.

## Do NOT
- Do not use `mw click 1` or `clickxy` on ONE's centre. When TWO overlaps it, this hits TWO (seen: -1).
- Do not press Tab twice. That focuses TWO.
- Do not click anything after Enter. The episode is already over.
