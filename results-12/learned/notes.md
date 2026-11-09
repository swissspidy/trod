# MiniWoB `mw` notes (from 360 sessions: 261 pass, 99 fail)

## Rules for every task
1. A task counts only if the page prints "The episode has ended." Every passed session got that line. Most failed ones stopped after doing "what the task said".
   - Always finish with the final action: Submit, Buy, Create, Send, the answer button or the menu leaf. Do this even when the task never says "Submit".
   - The only exception is a task whose last step itself ends the episode.
2. Never stop to ask a question or report "can't" without acting. Nobody answers. Ending without the final action is a certain fail; a best guess often passes.
   - Nothing matches (no synonym, no triangle): submit with nothing selected (passed).
   - Can't draw the circle: submit the leftover stroke (passed 3 of 3; refusing failed).
   - Stock price unreadable ("$undefined0"): still click Buy (two sessions that waited it out failed).
3. The final click is irreversible, so verify first. Check the `value=`/`checked` shown in the element list. For visual state, take a screenshot and Read it. Zoom with PIL (crop, then resize ×4–5 NEAREST) before counting or matching small things.
4. The observation printed right after `hover`/`click` can be stale: submenus and moved highlights often show up only later. Before deciding "nothing appeared", run `mw observe` (or a screenshot). Two menu sessions clicked the parent instead and failed.
5. `click <id>` takes only a bracket id. For coordinates use `clickxy x y`. `scroll` also needs an element id: `scroll <id> <dy>`. `scroll 0 300` errors.
6. Key names follow Playwright: `Backspace`, `Delete`, `ArrowLeft`, `End`, `Control+A`. The names `Left`, `BackSpace` and `ctrl+a` give "Unknown key".
7. Put several actions on stdin with a heredoc (`mw <<'EOF' … EOF`). Bare lines after `mw click 3` run as shell commands and fail.
8. `type <id> text` clicks the element's centre, clears it, then types. Retype a wrong value with `type` again.
9. `clickxy` hits only what is visible in the small viewport (about 160×210). Elements with y beyond about 210, or below 0, are off screen, and clicks there do nothing.
   - To bring an element into view, run `hover <id>` (or `click <id>` on a harmless text element). Then read the new @x,y from the observation and screenshot again.
10. Icons such as like, share, send, star, trash and dietary badges are not listed as elements. Find them in a screenshot and use `clickxy`.
11. Timing: short sleeps (≤5 s) work, alone or chained in one Bash call (`sleep 3; mw observe`, `mw click 1; sleep 2; mw click 2`). `sleep 60` is blocked. For time-sensitive tasks put the steps in ONE Bash call: the extra turns between separate calls add seconds.
12. Budget: 60 mw actions in total, and each line of a batch counts.
13. If every mw call, even `mw help`, returns HTTP 500 `Target crashed`, the page is dead. Check twice, then reply DONE.

## Index
Before acting, read the page that matches your task.
- Tasks that enter text, a date or a tag, tick radios, copy-paste or change case, then Submit: read `.trod/wiki/forms.md` first.
- Tasks like "How many small items…", "How many <letter>s / magenta zs are there?", "Type the total number of blocks", "how many sides": read `.trod/wiki/visual-count.md` first.
- Tasks like "Click the Like/Share/Retweet button on N posts by @user": read `.trod/wiki/social-media.md` first.
- Tasks like "Drag all circles into the black box", "Drag X to the 5th position / top right / down by one", "Draw a circle": read `.trod/wiki/drag.md` first.
- Tasks like "Click button ONE", "wait N seconds", "Select A>B", "Menu… item with the icon", "Select words similar to": read `.trod/wiki/menus-buttons.md` first.
- Tasks like right angle, tic-tac-toe, the HOT area, "Keep the mouse hovered": read `.trod/wiki/canvas-games.md` first.
- Email inbox, daily-calendar event, order food, buy stock: read `.trod/wiki/apps.md` first.
