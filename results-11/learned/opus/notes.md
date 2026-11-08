# MiniWoB `mw` notes (from 120 sessions: 58 pass, 62 fail)

## Rules for every task
1. A task counts only if the page prints "The episode has ended." Every passed session got that line. 35 of 62 failed ones never did: they stopped after doing "what the task said".
   - Always finish with the final action: Submit, Buy, Create, Send, the answer button or the menu leaf. Do this even when the task never says "Submit".
   - The only exception is a task whose last step itself ends the episode.
2. Never stop to ask a question or report "can't" without acting. Nobody answers. If nothing matches the task (no synonym, no triangle), submit with nothing selected (this passed in 112).
3. The final click is irreversible, so verify first. Check the `value=`/`checked` shown in the element list. For visual state, take a screenshot and Read it. Zoom with PIL (crop, then resize ×4–5 NEAREST) before counting small things. Misreading an unzoomed screenshot failed 002 and 003.
4. `click <id>` takes only a bracket id. For coordinates use `clickxy x y`. `scroll` also needs an element id: `scroll <id> <dy>`. `scroll 0 300` errors.
5. Key names follow Playwright: `Backspace`, `Delete`, `ArrowLeft`, `End`, `Control+A`. The names `Left`, `BackSpace` and `ctrl+a` give "Unknown key".
6. Put several actions on stdin with a heredoc (`mw <<'EOF' … EOF`). Bare lines after `mw click 3` run as shell commands and fail.
7. `type <id> text` clicks the element's centre, clears it, then types. Retype a wrong value with `type` again.
8. `clickxy` hits only what is visible in the small viewport (about 160×210). Elements with y beyond about 210, or below 0, are off screen, and clicks there do nothing.
   - To bring an element into view, run `hover <id>` (or `click <id>` on a harmless text element). Then read the new @x,y from the observation and screenshot again.
9. Icons such as like, share, send, star and dietary badges are not listed as elements. Find them in a screenshot and use `clickxy`.
10. Waiting: a short `sleep N` (N ≤ 5) in its own Bash call works. `sleep 60` chained with other commands is blocked.
11. Budget: 60 mw actions in total, and each line of a batch counts. One calendar session ran out.
12. If every mw call, even `mw help`, returns HTTP 500 `Target crashed`, the page is dead. Check twice, then reply DONE. It happened in 11 sessions (082–092), and none recovered.

## Index
Before acting, read the page that matches your task.
- Tasks that enter text, a date or a tag, tick radios, copy-paste or change case, then Submit: read `.trod/wiki/forms.md` first.
- Tasks like "How many small items…", "Type the total number of blocks", "how many sides": read `.trod/wiki/visual-count.md` first.
- Tasks like "Click the Like/Share/Retweet button on N posts by @user": read `.trod/wiki/social-media.md` first.
- Tasks like "Drag all circles into the black box", "Drag X to the 5th position / center", "Draw a circle": read `.trod/wiki/drag.md` first.
- Tasks like "Click button ONE", "Select A>B", "Menu… item with the icon", "Select words similar to": read `.trod/wiki/menus-buttons.md` first.
- Tasks like right angle, tic-tac-toe, the HOT area, "Keep the mouse hovered": read `.trod/wiki/canvas-games.md` first.
- Email inbox, daily-calendar event, order food, buy stock: read `.trod/wiki/apps.md` first.
