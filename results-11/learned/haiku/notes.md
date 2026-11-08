# MiniWoB tasks via `mw`: general rules

1. Press Submit before you stop. If the page has a Submit button, the task is not done until you click it, even when the wording says only "enter", "type", "select" or "drag". 16 of 16 sessions that had a Submit button and never pressed it failed. Pages without Submit end on their final action (Buy, Create, Send, Share, a menu item).
2. Never end with zero actions or with a question. Replying "which do you mean?" fails. Pick the most likely reading, act, and state the assumption in the final message. "Nothing matches, submit with nothing checked" is a valid action (passed in 112).
3. The final action closes the episode: "The episode has ended", then screenshots fail. Verify the state (screenshot, zoomed if small) before the last click, not after.
4. Read the task literally: exact count, exact word, exact case. Compute the final string before typing ("all lower case" means type lowercase; typing "JESS" failed).
5. Ids are the [n] numbers in the listing: `click 4`. Use `clickxy x y` or `dragxy` only for things with no id. `click 57,65` is rejected. `scroll <id> <px>` (a bare `scroll` errors).
6. Key names are Playwright names: Enter, Tab, ArrowLeft (not Left), Backspace (not BackSpace), Delete, Control+A (not ctrl+a), PageDown. An unknown key errors inside a batch but the other lines still run.
7. The listing omits icons, shapes, canvas and most glyphs. Then screenshot and Read it. Enlarge small regions with PIL (crop, resize x4-8, NEAREST) before counting or reading colours; one full screenshot miscounted 16 where the zoom gave 17 (001 vs 002/003).
8. `click <id>` scrolls its element into view (031, 032). `clickxy` at a point outside the visible area does nothing (020, 021).
9. If every mw call fails with a traceback or HTTP 500, check once: `cat .service/base-url` then `curl -s "$(cat .service/base-url)/task"`. Retry at most twice over about 30s, then stop and say the service is down. Do not claim success.

## Index
Before acting, read the page that matches your task.
- "Enter an item that starts with…", "Type X into the textbox", "Check the 3rd radio button and enter…", "type … in all lower/upper case": read `.trod/wiki/forms.md` first
- "Enter 07/15/2017 as the date": read `.trod/wiki/forms.md` first
- "Copy the text … and paste it": read `.trod/wiki/copy-paste.md` first
- "Click the Like/Share/Retweet button on … posts by @x", "Mark … email important", "Forward/Reply…": read `.trod/wiki/icons.md` first
- "How many … are there?", "press the button that denotes how many sides", "Select words similar to …": read `.trod/wiki/counting.md` first
- "Add a third point to create a right angle", "Draw a circle", "Keep the mouse hovered", "Find and click the HOT area", "Playing as 'X', tic-tac-toe": read `.trod/wiki/canvas.md` first
- "Drag … into the black box", "Drag X up by one / to the 5th position": read `.trod/wiki/drag.md` first
- "Buy X stock when the price is less than…": read `.trod/wiki/stock.md` first
- "Create a N mins event named…": read `.trod/wiki/calendar.md` first
- "Select A>B", "Click the Menu button… icon", "Order N items that are vegan", "Click button ONE, wait N seconds, then TWO": read `.trod/wiki/menus.md` first
