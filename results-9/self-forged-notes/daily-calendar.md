# daily-calendar notes

## RULES
- Clicking the Create button (`button.create`) ends the episode. Solved = reward 1. Do not click it until the form shows the right times.
- Element ids change after almost every action. Run `mw observe` again and take the id from the newest output before each action.
- Hour labels above the view have negative y. Click the window-start hour label first; this scrolls the grid so it sits near y≈110. Screenshots show only the top ~210px, so use observe coordinates.
- Create by dragging on empty grid: `dragxy 100 <y0> 100 <y1>`, y0 = start label top + ~3. Don't drop on existing blocks (randomEvent*); pick a gap fully inside the window.
- A drag makes a "New event" block plus a form: name input, time-start/time-end labels, Cancel, Create. Duration is not linear in drag length: 11px gave 30m, 30px gave 1h, 41px gave 1.5h; 18px gave 30m once and 1h once. Always read the labels; if wrong, Cancel and redrag.
- Type the name into the input (`type <id> "<name>"`) before Create.
- Untested: 2h+.

## RECIPE (worked 4 of 4)
1. `mw reset`, `mw observe`.
2. `click <start-hour label id>`, observe.
3. `dragxy 100 <y0> 100 <y0+L>` in a gap (L≈11 for 30m, 30 for 1h, 41 for 90m).
4. Observe; check time-start/time-end match the task.
5. `type <name id> "<name>"`, observe, `click <create id>` → reward 1.
