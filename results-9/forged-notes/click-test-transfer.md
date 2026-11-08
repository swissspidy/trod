# click-test-transfer notes

Page: two 40x40 buttons, labels "ONE" and "TWO", placed at random positions (their x,y change every episode). Task text so far was always "Click button ONE."

RULES
- Any click on a button ends the episode. Clicking the wrong button gives reward -1 and you get no retry. Check the label before you click.
- Pick the button by its quoted label in the observation ("ONE"/"TWO"), not by position or id number. The task text names the label to click.
- Use `click <id>` with the id from the latest observation. It worked 7/7 times. Don't use clickxy: the buttons can overlap, so clicking by coordinates may hit the other one.
- Nothing else is needed: no submit, no hover, no waiting. A single click finishes the task.
- If the task names a label that isn't on the page, run `observe` again before clicking.

RECIPE
1. `observe` → find the line `[<id>] button... "<LABEL from task>"`
2. `click <id>`. Done (the episode ends right away).

Seen so far: ONE was always [1] (button#subbtn) and TWO was always [2] (button#subbtn2). Still, match the label, not the number.
