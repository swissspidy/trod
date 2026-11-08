# visual-addition notes

RULES
- The blocks are NOT in `mw observe` output (only "+", the input, Submit). Always `mw screenshot /tmp/s.png` and Read the image to count them.
- Count the blue squares on the left of "+" and on the right separately, then add. Each group is a grid up to 3 columns wide, filled row by row. The last row may be partial (e.g. 3+3+1 = 7). Count rows x 3, then fix the last row. Groups range from 1 to 9 squares.
- Answer is a plain integer (e.g. `16`). No spaces or words.
- Use `mw type <input id> <n>`. It clears the box first, so retyping is safe before you submit.
- Pressing Enter in the textbox does NOT submit (episode keeps running). You must click the Submit button.
- Clicking Submit ends the episode, right or wrong. Check the count twice before clicking.
- No timing problems: screenshot, type, click all worked fine.

RECIPE (solved 4/4)
1. `mw screenshot /tmp/s.png`, then Read /tmp/s.png
2. total = <left count> + <right count>
3. `mw type 2 <total>`  (id 2 = input#math-answer)
4. `mw click 3`  (id 3 = button#subbtn "Submit"; ends the episode)
