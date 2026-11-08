# MiniWoB via `mw`: rules from 120 earlier sessions

## General rules (all tasks)
1. **No "The episode has ended" means the task is not done.** Nearly every task is scored only when you make the final action (Submit, Buy, Order, Create, send, the answer button). Many sessions filled the form correctly and replied DONE without clicking Submit, and those all failed (autocomplete, radio+textbox, synonyms, count-shape). If a Submit or answer button exists, click it last. Only "keep the mouse hovered" tasks end on their own.
2. **The final action can't be undone, so check before you make it.** Read the values in the listing (`value="..."`, `span.quantity`) or take a screenshot first. A click on a menu parent or a wrong answer button ends the episode at once.
3. **Doing nothing is a sure fail.** If you are unsure, submit your best attempt. Never stop and ask: nobody answers.
4. `mw` syntax:
   - `click/hover/type/drag/scroll` take the **[id]** from the latest listing. They never take coordinates: `click 57,65` and `scroll 0 300` error. For coordinates use `clickxy x y` / `dragxy x1 y1 x2 y2`.
   - Several actions go through a heredoc: `mw <<'EOF'` … `EOF`. Bare lines after `mw click 3` run as shell commands and fail.
   - Key names are Playwright names: `Backspace`, `ArrowLeft`, `Control+A`, `Shift+Tab`, `Enter`. `BackSpace`, `Left` and `ctrl+a` all error.
   - `type <id> text` clicks the field and clears it first, so you never need Backspace or select-all.
   - Ids can change after any action. Re-read the newest listing before you use an id.
5. **Icons are often missing from the listing** (like/share/retweet, email send/star, tic-tac-toe cells, HOT area). Take `mw screenshot p.png`, Read it, then use `clickxy`. Coordinates in the listing and in the screenshot match.
6. **The screenshot shows only the visible task area (about 160x210).** Elements whose listed y is past about 210, or below 0, are off-screen. `hover <id>` or `scroll <id> <px>` on an element inside the scrolling list brings it into view, and the listing's y values update.
7. **For small visuals (counting blocks, sides or shapes), crop and upscale before you decide.** Use `python3 -c "from PIL import Image; Image.open('p.png').crop((x0,y0,x1,y1)).resize((W*5,H*5),Image.NEAREST).save('z.png')"` and Read `z.png`. On the same page, a raw screenshot gave 16 and the zoomed one gave 17.
8. **Waits:** put `sleep N` in its own Bash call between two `mw` calls (N ≤ 20; the harness blocks longer sleeps). Don't run the sleep and the next click in parallel.
9. **If `mw` returns HTTP 500 / "Target crashed" on every call, `mw help` included, the page is dead.** Stop after one retry and reply DONE with what happened. Waiting doesn't bring it back.
10. You have 60 actions in total. Calendar sessions ran out of actions. Plan before you probe.

## Index
Before acting, read the page that matches your task.
- Tasks like "Enter 07/15/2017 as the date", "Type X in lower case", "Enter an item that starts with…", "Copy the text…", "Check the 3rd radio button…": read `.trod/wiki/forms.md` first.
- Tasks like "Click the Like/Share/Retweet button on posts by @user": read `.trod/wiki/social-media.md` first.
- Email tasks ("Forward/Reply to/Mark … email"): read `.trod/wiki/email.md` first.
- Tasks like "Select A>B>C", "Click the Menu button… item with the icon", "Select words similar to…": read `.trod/wiki/menus-choices.md` first.
- Tasks like "How many small items/5s…", "how many sides", "total number of blocks": read `.trod/wiki/visual-count.md` first.
- Drag, draw and geometry tasks ("Drag all circles into the black box", "Drag X to the 5th position", "Draw a circle", "Add a third point to create a right angle"): read `.trod/wiki/drag-draw.md` first.
- Tasks like "Create a 90 mins event named…": read `.trod/wiki/calendar.md` first.
- Other tasks (tic-tac-toe, buy stock, hover square, HOT area, order food, click buttons ONE/TWO): read `.trod/wiki/misc.md` first.
