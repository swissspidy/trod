# Notes for kinds of web tasks

Apply the section that matches your task.

<!-- button-delay -->
# button-delay notes

RULES
- Clicking TWO ends the episode. Clicking TWO too early or too late only gets part credit (0.35–0.6 seen).
- Start the wait right after clicking ONE. Run nothing in between (no observe, no screenshot). Each mw call takes about 0.25 s.
- Sleep N−0.2 s, where N is the "wait N seconds" from the task text. This scored 1 every time for N=1,2,3. Waits that ran long (about 1.7 s for N=1, 4.7 s for N=3) and an early TWO (about 0.75 s for N=1) got 0, 0.35 or 0.6.
- Find each button by its label "ONE"/"TWO", not by id order.
- The buttons can overlap, and TWO is drawn on top. Then `click <ONE id>` lands on TWO and scores −1. So click ONE with `clickxy` on a spot TWO does not cover. `@x,y` is the top-left corner and each box is 40x40.
- Time since reset does not matter: an 8 s idle before acting still scored 1. Plan first, then do the click, sleep, click in ONE bash command.
- Plain `sleep` may be blocked. Use python3 -c "import time;time.sleep(S)".

RECIPE (one bash command)
1. `mw observe`: note N, ONE @ax,ay, TWO @bx,by and TWO's id.
2. Pick a point (px,py) inside ONE, x in [ax+3,ax+37] and y in [ay+3,ay+37], that is NOT inside [bx-2,bx+42]x[by-2,by+42]. Prefer (ax+20,ay+20) if it is not covered.
3. `mw clickxy <px> <py>; python3 -c "import time;time.sleep(<N>-0.2)"; mw click <TWO id>`

<!-- click-button-sequence -->
# click-button-sequence — rules

- Run `mw observe` first. There are two buttons, labeled "ONE" and "TWO", at random positions that sometimes overlap. Choose each button by its label text, not by its position. The ids have so far been [1]=ONE and [2]=TWO, but check that each time.
- Click the buttons in the order the task gives. The order is ONE, then TWO.
- Do NOT click TWO first. Doing so does not end the episode right away, but it ruins it: clicking ONE next ended the episode with reward -1. There is no recovery.
- Clicking ONE does not end the episode (reward 0, still running). Clicking TWO after it ends the episode with reward 1.
- No submit button, hovering or waiting is needed. A plain `mw click <id>` works. Overlapping buttons did not cause problems, because clicks by id hit the right button.
- Click each button exactly once. Do not test-click anything.

## Recipe (worked 4 times out of 4)
```
mw observe                  # find the ids of "ONE" and "TWO"
mw click <id of ONE>
mw click <id of TWO>        # ends the episode, reward 1
```

<!-- click-checkboxes-soft -->
# click-checkboxes-soft — RULES

- Clicking Submit ENDS the episode immediately. Tick every box first, then click Submit once.
- Each target word in the task has exactly ONE matching checkbox: that word itself or a synonym
  (furious→mad, automobiles→car, halt→stop, old→aged, vermillion→red, scared→terrified,
  small→mini/little, pig→swine). Plurals map to the singular (flames→flame).
  So tick exactly as many boxes as there are words in the task.
- Some boxes are distractors (e.g. dumb, home, quiet, carve, fleshy when "fat" isn't asked).
  Don't tick them: a wrong or extra box only gets partial credit (0.5–0.6), not 1.0.
- Clicking either the label or the input#chN checkbox toggles it. Clicking again unticks it.
  Check that "checked" shows in the output before you submit.
- No timing tricks, scrolling or hovering needed. Before Submit the reward stays 0, and the
  episode keeps running while you tick boxes.

## Recipe (worked 8/8 times, 1.0 each)
1. `mw observe`. Read the task words <w1..wn> and each label/checkbox pair.
2. For each <wi>, find the label that is the same word or a synonym. Then `mw click <checkbox id>`.
   (Tip: you can loop over the ids, e.g. `for i in <ids>; do mw click $i; done`.)
3. Check that exactly n boxes show `checked` and that they're the right ones.
4. `mw click <Submit button id>` (button#subbtn, it's the last element).

<!-- click-menu -->
# click-menu notes (jQuery UI nested menu)

Task: "Select A>B>C" (path of 1-3 levels; 1 level = just "Select A").

RULES
- NEVER click a parent (non-final) item: clicking any item ends the episode at once; a parent click scored -1. Only the LAST name in the path gets a click.
- Open submenus with `hover <id>`, not click. The submenu shows up after a short delay: the observation printed by `hover` usually does NOT show it yet. Run `sleep 0.5; mw observe` before looking for the next level.
- After each hover, new submenu items get NEW ids. Always take ids from the latest observe.
- Match names exactly, whole word: "Bea" is not "Beatrisa". Look under the submenu `ul` that appeared after the item you hovered (it is listed right after its parent).
- You don't need a submit button: clicking the final item is the whole answer.
- The menu is small (~3-4 items per level), so you never need to scroll.

RECIPE (worked 5/5)
1. `mw observe`, then find the item named <level1>.
2. If the path has more levels: `mw hover <id1>; sleep 0.5; mw observe`
3. Repeat the hover + sleep + observe for each middle level <levelK>, using the new ids.
4. `mw click <id of last name>`, and you're done (one try).
Single-level path: just `mw click <id>` on the item.

<!-- click-menu-2 -->
# click-menu-2 (jQuery UI menu)

Task is one of two forms: item *labeled "<Label>"*, or item *with the <icon> icon* (the icon is an image, so the task text shows an empty gap).

RULES
- First `click` the "Menu" button (id 1). The menu items show up only after that.
- Clicking any enabled leaf item ends the episode. A wrong one scores -1. Be sure before you click.
- Clicking or hovering "Playback" (the parent with ">") only opens its submenu (Prev, Stop, Play, Next). It does NOT end the episode. Do this first if the target is not in the top-level list.
- "Print..." is disabled (greyed). Clicking it does nothing and does not end the episode.
- ICON tasks: the icon name is missing from the text, so you MUST `screenshot` and Read it. Compare the icon in the yellow task bar with the item icons. Open Playback first so the submenu icons are visible too. Upscale/crop if they're unclear: Zoom In = magnifier with "+", Zoom Out = magnifier with "-", Save = floppy disk, Prev = |◄, Stop = ■, Play = ►, Next = ►|.
- Labels match the item text exactly. Submenu items get new ids (e.g. 9-12) after Playback opens, so read the ids from the latest observation.

RECIPE
1. `click 1` (Menu)
2. If the target is a Playback child or this is an icon task: `click <Playback id>`
3. Icon task: `screenshot /tmp/s.png` and Read it, then map the icon to its item label
4. `click <id of target item>` (done, no submit needed)

<!-- click-test-2 -->
# click-test-2 notes

Task: "Click button <LABEL>." Two 40x40 buttons, labelled "ONE" and "TWO", at random positions. They may overlap or sit close together.

RULES
- Any button click ends the episode at once. Clicking the wrong button gives reward -1 with no retry, so get it right the first time.
- Pick the element by its quoted label text in `mw observe`, e.g. `"ONE"`. Don't go by the id number, the position or the order in the list. Ids and positions change every episode.
- Use `mw click <id>`, not clickxy. With clickxy the buttons can overlap, and you may hit the wrong one.
- You don't need a submit, hover or wait. One click on the right button gives reward 1.
- Don't press keys or click anything else before the target. Every button counts as a final action.

RECIPE (worked 4 of 4 times in a row)
1. `mw observe` and read the task "Click button <LABEL>."
2. Find the line `[<id>] button... "<LABEL>"`, matching the label exactly.
3. `mw click <id>`. Done.

<!-- click-test-transfer -->
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

<!-- copy-paste -->
# copy-paste task notes

RULES
- Clicking Submit ends the episode, right or wrong. Check the input's value before you click it.
- Do NOT use `type` for the answer. The source text usually ends with a trailing space, and `type` strips it. That makes the answer wrong (reward -1, seen).
- Copy with the real clipboard instead. It keeps the text exactly, including the trailing space (seen 4/4).
- Element ids change between episodes: the textarea and the input swap order. Before acting, read the ids from `mw observe`: textarea#to-copy, input#answer-input, button#subbtn.
- Before copying, click the textarea first. Otherwise Control+A/Control+C copy nothing useful.

RECIPE (worked 4 times in a row)
```
mw observe                  # note ids <TA>, <IN>, <BTN>
mw click <TA>               # textarea#to-copy
mw press Control+A
mw press Control+C
mw click <IN>               # input#answer-input
mw press Control+A          # select anything already there
mw press Control+V          # check: value matches the textarea exactly, trailing space included
mw click <BTN>              # Submit -> episode ends
```

<!-- copy-paste-2 -->
# copy-paste-2 rules

- Clicking Submit ends the episode, right or wrong. Check the input's value with `observe` before you click Submit.
- Read the ordinal in each new task ("1st/2nd/3rd text area"). It changes every episode. The Nth text area is textarea#text-N. Don't reuse the ids from the last episode without checking.
- The answer must match the text area exactly, including its TRAILING SPACE (most values end in " ").
- DON'T use `type <id> <text>`. It drops the trailing space, so the answer is wrong (reward -1, seen twice).
- DO use the real clipboard: Control+A / Control+C in the text area, then Control+V in the input. It copies the text byte for byte (worked 4/4).
- If the input already holds wrong text, click it and press Control+A before Control+V, so the paste replaces it.

## Recipe (ids as seen; confirm with observe)
```
mw click <N>          # textarea#text-<N>, N = ordinal in the task
mw press Control+A
mw press Control+C
mw click <input id>   # input#answer-input (was [4])
mw press Control+A
mw press Control+V
mw observe            # the input's value must equal text-<N> exactly, trailing space too
mw click <submit id>  # button "Submit" (was [5]); this ends the episode
```

<!-- count-shape -->
# count-shape notes

RULES
- Clicking ANY number button ends the episode at once (no submit, no undo). Count first, click once.
- Don't need screenshots: `mw observe` lists every item with type, fill colour and size. Count from that list.
- Size: SMALL = text height 11 (e.g. 6x11, 7x11, 2x11) or shapes 10x10. LARGE = text height 22/23 or shapes 20x20. Use the height, not the width.
- "items" = everything above the buttons (text + shapes). Don't count the buttons.
- "shapes" = only non-text elements (circle, rect, polygon). Letters/digits are NOT shapes.
- "triangles" = polygon (seen as triangles in screenshot).
- "letters" = text items that are a-z/A-Z only; digits are NOT letters. "digits" = text 0-9.
- "How many Xs" (e.g. "es", "Is", "7s") = text equal to X, CASE-SENSITIVE: "es" counts only "e", not "E" (counting both failed).
- Colour words match fill= exactly (red, blue, aqua, magenta, green, yellow, black).
- Combine every filter in the question (size AND colour AND kind), e.g. "small magenta items" = fill magenta with height 11/10.

RECIPE
1. `mw observe`
2. Keep the items that match <size> (height 11/10=small, 22/20=large), <colour> (fill=) and <kind> (items / shapes / letters / digits / triangles / exact char, case-sensitive).
3. `mw click <id of button whose label = count>` (one click, done).

<!-- count-sides -->
# count-sides — rules

- The shape is NOT in the element list (only number buttons show). ALWAYS run `mw screenshot <file>.png` and Read the image before clicking.
- ONE click on any number button ends the episode: right = reward 1, wrong = reward -1. No submit, no retry. Don't click to "explore".
- Shapes seen: regular polygons, randomly rotated, 3 to 7 sides (triangle, pentagon, heptagon seen). Buttons seen: "3".."7".
- Count VERTICES (corners) one by one going around the outline, writing approximate pixel coordinates of each, rather than guessing from overall look. 6 vs 7 and 5 vs 6 look alike when rotated — the heptagon is the main trap.
- Click by the id whose LABEL equals your count (ids [1]-[5] were "3"-"7" every time, but check the list, since ids != numbers).
- Coordinates like `@24,167` in the list are button positions; `click <id>` is reliable, no need for clickxy.

## Recipe
1. `mw screenshot /tmp/s.png` → Read /tmp/s.png
2. List each corner of the shape (e.g. top, upper-right, right, ...) → N = number of corners
3. `mw click <id of button labelled N>` (done; episode ends)

<!-- daily-calendar -->
# daily-calendar rules (4/4 solved with this)
- Clicking Create ends the episode. First check that #time-start/#time-end in the popup show the right times and that the name is spelled exactly as in the task.
- Ignore existing events that have the same name as the task (e.g. "Phonecall" at 6am). They are decoys. Always create a new event.
- A single click on the grid does nothing, and dragging that starts on an existing event does nothing. Make a new event with `dragxy` over EMPTY grid only, at x=80.
- The grid is scrolled off-screen at first. Click an hour-label first (it scrolls to y~110), then `observe` again to get the new y positions.
- One hour is 41px and a slot is 30 min (~20px). The label y is the hour line. The start rounds to the slot at y1. The end INCLUDES the whole slot under y2. So set y1 = startLabelY+5 and y2 = y1 + minutes/30*20.5 - 10 (30 min: +10, 60 min: +25, 90 min: +51).
- Find a free gap inside the window. An event's y and height give its time (42px = 1h).
- Cancel closes the popup without ending the episode, but element ids SHIFT. Re-read ids before you act.
- Duration may be written "90 mins" or "1.5 hours".

## Recipe
1. `click <id of hour-label for start hour>`, then `observe`
2. `dragxy 80 <labelY+5> 80 <labelY+5+minutes/30*20.5-10>`
3. Check the output for time-start = <start> and time-end = <start+duration>. If wrong, Cancel and drag again.
4. `type <input#event-name id> <Name>`
5. `click <button.create id>`

<!-- drag-items -->
# drag-items (sortable list of 5 names)

RULES
- The FIRST drag ends the episode, right or wrong. There is no submit button. Work out the target slot before you drag.
- Work out the target index (1-5) from the text: "1st/top" = 1, "bottom" = 5 (the last item), "up by one" = current-1, "down by one" = current+1, "Nth position" = N.
- Use `dragxy`, not `drag <id> <id>`. `drag` drops on the target's centre. That worked for upward moves but FAILED (reward -1) for a downward move by one.
- Item boxes are about 24px tall. The observe y is the top of the text, and the box spans roughly y-5 to y+19. Centre x = 83.
- Moving UP: drop on the TOP edge of the target item (target_y + 1).
- Moving DOWN: drop on the BOTTOM part of the target item (target_y + 15).
- Pick up the source from its middle (source_y + 7).

RECIPE (solved 9 in a row)
1. `mw observe` → note the y of <source> and of the item now at <target index>.
2. If target index < source index: `mw dragxy 83 <src_y+7> 83 <tgt_y+1>`
   If target index > source index: `mw dragxy 83 <src_y+7> 83 <tgt_y+15>`
3. Example with y values 63,91,120,149,177: move item 3 to the top: `dragxy 83 127 83 64`; move item 2 to 3rd: `dragxy 83 98 83 135`; move to the bottom: `dragxy 83 <src_y+7> 83 193`.
4. Don't run any other action after the drag; the episode is already over.

<!-- drag-items-grid -->
# drag-items-grid notes

The grid is 3x3 and holds 9 items (index 0-8, row-major). The `@x,y` in observe is the top-left corner of the item's small text label. The item's box is about 40x40 and starts at about (x-3, y-3), so its center is about (x+17, y+17).

RULES
- Any drag ends the episode, right or wrong. You get one drag.
- Do NOT use `mw drag <id> <id>`, and do NOT drop exactly on the target's center. Both scored -1. The grid is a sortable list: the dragged item is taken out and put back in, and the others shift.
- Use `dragxy`. Start at the center of the source box. Drop past the target's center, in the direction you are moving:
  - Moving forward (target index > source index): drop near the target's bottom-right, about (x+38, y+30).
  - Moving backward (target index < source index): drop near the target's top-left, about (x+2, y+2).
- Find the target from the task text on the 3x3 layout: top/center/bottom = row, left/center/right = column. "up/down by one" = same column, row ±1. "left/right by one" = same row, column ±1 (not tested). The target box is the item currently in that slot.

RECIPE (4 of 4 solved this way, in a row)
1. `mw observe`. Find the source at (sx,sy) and the item currently in the target slot at (tx,ty).
2. If target index > source index: `mw dragxy <sx+17> <sy+17> <tx+38> <ty+30>`
   Otherwise: `mw dragxy <sx+17> <sy+17> <tx+2> <ty+2>`
3. Done. The episode ends after the drag. No submit is needed.

<!-- drag-shapes -->
# drag-shapes NOTES

RULES
- Clicking Submit ends the episode. Do all drags first, then click Submit once.
- Shape names map to element tags: "circles" = `circle`, "triangles" = `polygon`,
  "rectangles"/"squares" = `rect` with a fill colour (17x17). The black box is
  `rect#shape-container fill="none"` (80x45). Don't drag the box itself.
- Colour doesn't matter. Move EVERY shape of the asked type, whatever its colour.
- Never move a shape of another type into the box: one extra shape gives reward -1.
- If no shape of the asked type exists (common, e.g. no rect), just click Submit
  with the box empty. That scored 1.
- `drag <shape_id> <box_id>` works every time. It drops the shape at the box
  centre, and shapes stacking on top of each other there is fine.
- After each drag the new state is printed: check that the shape's @x,y now lies
  inside the box (box @x,y is its top-left corner, plus 80x45).
- A wrong shape in the box can be fixed: `dragxy <cx> <cy> <x> <y>` from its
  centre (@x+8, @y+8) to an empty spot outside the box, e.g. 20 160. Then submit.
- No hover, timing or typing is needed. Coordinates in observations are the
  top-left corner of each element.

RECIPE (scored 1 in 6 of 6 episodes that followed it)
1. Read the task type <T> and list the ids whose tag matches <T> (circle/polygon/rect,
   not the container).
2. For each such <id>: `mw drag <id> <container_id>`.
3. Check the printed positions (no extra shapes in the box), then `mw click <submit_id>`.

<!-- draw-circle -->
# draw-circle notes

RULES
- Clicking Submit ends the episode. Draw first: submitting with nothing drawn scores -1.
- `dragxy` draws only a straight 12-step line. No action keeps the mouse button held between moves, so you cannot draw a real curve.
- Every new drag wipes the previous stroke and only the LAST stroke is scored. Do not draw a polygon from several drags. Make exactly ONE drag.
- The marked point is `circle#circ @x,y 8x8`, where @ is its top-left corner. Its center is cx=x+4, cy=y+4.
- A horizontal or vertical line through the center fails (-0.25), and so does a very short stroke.
- What passes: a diagonal chord across one quarter of a circle of radius about 25 around the center, from (cx±25, cy) to (cx, cy±25). It scored 0.9 in all 4 quadrants, 8 for 8. A diagonal through the center (cx-15,cy-15 → cx+15,cy+15) scores only about 0.7.
- Keep the whole stroke inside the drawing box (about x 2..154, y 52..163). Strokes that reach the edge score lower or fail. Point the chord toward the middle of the box.
- Click Submit by its id (`click <id>`), not by coordinates.

RECIPE (worked 8/8 in a row)
1. `mw observe`, then read `circle#circ @<x>,<y>`. Set cx=<x>+4 and cy=<y>+4.
2. dx = -25 if cx > 78, else +25. dy = -25 if cy > 107, else +25.
3. `mw dragxy <cx+dx> <cy> <cx> <cy+dy>` (one drag only)
4. `mw click <submit id>`

<!-- email-inbox-nl-turk -->
# email-inbox-nl-turk notes

Task wording varies (typos, casual phrasing) but always means one of 4 actions on ONE email from <Sender>:
forward ("forward/send X's email to Y"), reply ("reply/respond/send 'T' as response"), delete ("remove/trash/delete"), important ("mark/save/set as important" = star).

RULES
- The send, trash and star icons are NOT listed as elements. Click them with clickxy. The first such click ends the episode, so set everything up first.
- Open the email first by clicking its div.email-sender "<Sender>" id. This works even if the row is off-screen, so don't scroll.
- In the open email: trash is at clickxy 147 62, star (important) at clickxy 133 62.
- Forward: click "Forward", then type <input.forward-sender id> <Recipient> (name only), then clickxy 147 62 (send). Leave subject and body as they are.
- Reply: click "Reply", then type <textarea#reply-text id> <exact text> (keep the punctuation, drop the quotes), then clickxy 147 62.
- If coordinates seem off, take a screenshot and Read it. The send arrow is at the top right of the left pane.

RECIPE (worked 5/5)
1. mw observe, then find the id of the div.email-sender "<Sender>".
2. mw click <id>
3. One of:
   - delete: mw clickxy 147 62
   - important: mw clickxy 133 62
   - forward: mw click <Forward id>, then mw type <input id> <Recipient>, then mw clickxy 147 62
   - reply: mw click <Reply id>, then mw type <textarea id> <Text>, then mw clickxy 147 62

<!-- enter-date -->
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

<!-- enter-text-2 -->
# enter-text-2 NOTES

Task: 'Type "<WORD>" in all lower|upper case letters in the text input and press Submit.'
Elements: [1] input#tt, [2] button "Submit" (ids from the latest observation).

RULES
- Read the case word every time. Both "lower case" and "upper case" episodes happen, and the quoted word may be in the opposite case (e.g. "enola" + upper case -> ENOLA).
- Convert the WHOLE word to the requested case. Change the letters only: no quotes, no spaces, no extra characters.
- Clicking Submit ends the episode, right or wrong. Submitting the word in the wrong case gave reward -1. Check the value= shown after `type` before you click.
- Pressing Enter in the input does NOT submit (reward stayed 0 and the episode kept running). Click Submit.
- `type` clears the field first, so retyping before Submit is safe.

RECIPE (solved 4 of 4 this way)
1. mw type <input id> <WORD converted to requested case>
2. Check that the observation shows value="<converted word>"
3. mw click <Submit id>

<!-- form-sequence-2 -->
# form-sequence-2 NOTES

Task looks like: "Check the <Nth> radio button and enter the number "<num>" into the <Mth> textbox."
Layout seen every time: 3 radios (ids 1-3, value=1..3, left to right), 3 textboxes (input-1..input-3, ids 4-6), then a Submit button (id 7). Check the ids in your own observation before acting.

RULES
- Clicking Submit ends the episode right away, right or wrong. Click it LAST, only after you have checked the radio AND filled the textbox. (Submitting with no radio checked scored -1.)
- You MUST click Submit. Filling the form alone leaves reward 0 with the episode still running, and pressing Enter in a textbox does NOT submit.
- Count "Nth" by position, starting from 1: 1st radio = radio value="1", 2nd textbox = input#input-2.
- Type the number exactly as given, including a leading minus ("-5" works fine as `mw type <id> -5`).
- The order of the radio click and the typing does not matter.
- Before Submit, check the observation output: the radio should show `checked` and the textbox should show `value="<num>"`.

RECIPE (solved 6 of 7; the one failure was a deliberate test that skipped the radio)
  mw click <radio id for Nth>
  mw type <textbox id for Mth> <num>
  (check the output: radio checked, value="<num>")
  mw click <Submit id>

<!-- hot-cold -->
# hot-cold: "Find and click on the HOT area"
Layout: blank box ≈ x 3-157, y 53-178. Signal div below it shows ICE COLD/COLD/WARM/HOT for the mouse position.

RULES
- ANY click (clickxy, or a drag that starts and ends at the same spot) ends the episode. Click once, at HOT center.
- Use dragxy to move the mouse (there's no hover-by-coordinates). Drags that START outside the box don't update the signal.
- FIRST action: warm up with `mw dragxy 80 115 80 20` (inside→outside). Without it, the first inside→inside drag counts as a click (reward -1).
- Probe P=(x,y) with `mw dragxy x y x y+10` (use y-10 if y>150). A drag far away (e.g. to y=30) gives readings shifted by up to 10px. Clicking there scored only 0.25-0.5.
- HOT spot is small (≈8px wide). WARM ≈ ±8px, COLD ≈ ±40px, everything else ICE COLD.
- Reward depends on how close the click is to the center: find the edges of the HOT region and click the midpoint. Got 1.0 in 8/8 tries.

RECIPE (bash)
pr(){ e=$(( $2>150 ? $2-10 : $2+10 )); mw dragxy $1 $2 $1 $e | grep -o '"[A-Z ]*"'; }
1. mw dragxy 80 115 80 20
2. Coarse grid: for y in 60 90 120 150 172; x in 15 45 75 105 135 152: pr x y. Stop at the first COLD/WARM/HOT.
3. Probe around the best point in steps of ~10, then 3. If stuck at COLD, grid ±30 in steps of 10. Move toward WARM, then HOT.
4. From a HOT point, step ±2 in x until it stops reading HOT → cx=(left+right)/2. Then at cx, step ±2 in y → cy.
5. mw clickxy <cx> <cy>   (single final action)

<!-- order-food -->
# order-food NOTES

RULES
- Clicking "Order!" ends the episode. Set all quantities first.
- Counts must be exact; an extra item gives -1. Before ordering, check `mw observe | grep quantity`.
- Click the `span.add "+"` right after the item's name. Ids stay the same; off-screen (negative y) clicks still work, so don't scroll.
- "Order N items that are <tag>": any mix of matching items works, repeats included (3+1 and 4x one item both scored 1). Tags show only as icons in a screenshot, not in observe. The menu was the same 12 items every time:
  - meat: Chicken wings, Spicy Thai Peanut Chicken, Grilled Pork Tenderloin, Spaghetti and Meatballs
  - peanuts: Spicy Thai Peanut Chicken, Ice cream sundae
  - vegan (leaf): Caesar Salad, Garlic bread, Tofu and Vegetable stone pot, Coconut mango tart
  - dairy (blue carton): Spinach and goat cheese dip, Cheese wheel, Chocolate cake, Ice cream sundae
  - gluten-free (yellow wheat): Caesar Salad, Spinach dip, Tofu pot, Grilled Pork, Cheese wheel, Ice cream sundae
  If the menu differs, run `mw hover <item id>` then `mw screenshot x.png` to see the icons.
- "One of each item: A, B": press + once on each, nothing else.

RECIPE
1. `mw observe` and note the "+" id for each <item>.
2. `mw click <plus id>` until the counts are right.
3. `mw observe | grep quantity` and confirm the total is <N>.
4. `mw click <Order! id>` (the last element).

<!-- right-angle -->
# right-angle notes (solved 4/4 this way)

RULES
- Clicking Submit ends the episode. Before you click it, place the third point.
- The right angle goes at the BLUE point (circle#init-blue), not the black one. The third point P must make blue→P perpendicular to black→blue.
- Get the centers from the circles' bounding boxes: center = (x + w/2, y + h/2). For `@17,107 7x7` that is (20.5,110.5). Don't use the `line` box.
- Place the point with `clickxy`. The drawing area is about x 0–160, y 50–170. Don't place a point near the Submit button (y≈178–209) or the yellow task bar (y<50).
- Clicking the canvas again MOVES the third point; it does not add a fourth. So you can fix a bad point before you submit.
- Put P far from blue (30–60 px). With small pixel rounding, a longer arm keeps the angle closer to 90°. A reward around 0.97–0.99 counts as solved.
- No drag, hover or screenshot needed.

RECIPE
1. Read [black] @<bx>,<by> <w>x<h> and [blue] @<ux>,<uy> <w>x<h>. Compute the centers B and U.
2. Compute d = U − B = (dx, dy). Take the perpendicular as (−dy, dx) or (dy, −dx). Pick whichever keeps P = U + t·perp inside x 5–155, y 55–170 (t ≈ 1, or scale it so the arm is 30–60 px).
3. Run `clickxy <Px> <Py>`. The output should show a new circle#blue-circle and a line from blue to it.
4. Run `click <Submit id>`.

Example: B=(22.5,71.5), U=(25.5,103.5), d=(3,32) gives perp (32,−3)×2, so P=(89,97). Then submit, reward 0.97.

<!-- social-media-all -->
# social-media-all (Reply/Retweet/Like/Share on all posts by @user, then Submit)

RULES
- The action icons are NOT in `mw observe`. Click them with `clickxy <x> <y>`.
  Icon x (fixed): Reply 25, Retweet 58, Like 91, Share 122.
  Icon y = (current y of that post's span.username) + 47 (same for 1- or 2-line bodies).
- Visible area is only ~y 50..210; the feed scrolls inside. `mw scroll` did NOT
  scroll it. Use `hover <id>` to scroll an element into view, then `observe` again:
  coordinates in observe update after scrolling (can go negative).
- Clicking Submit ends the episode, right or wrong. Do every post first.
- Match by span.username text exactly (e.g. "@quis"), not span.name; targets are
  interleaved with other users. Count them all, incl. ones far below (y up to ~700).
- Icons toggle: a wrong icon click does not end the episode; clicking it again
  undoes it (verified reward 1 after undo). So never click a target icon twice.
- Verify via `screenshot` if unsure: active Like=red, Share=purple, Reply=blue.

RECIPE (6/6 solved)
1. `mw observe` -> list ids of span.username "<@user>" (id U; U+1 = body, U+2 = next post name or Submit).
2. For each U top to bottom: `mw hover <U+1>`; `mw hover <U+2>` (element just below the post, so its icon row is on screen);
   `mw observe` -> read y of [U]; `mw clickxy <X> <y+47>`.
3. `mw click <Submit id>`.

<!-- social-media-some -->
# social-media-some (click <Action> on N posts by @user, then Submit)

RULES
- The action icons (Reply/Retweet/Like/Share) are NOT in the element list. Click them with `clickxy <x> <name_y+49>`. x: Reply=25, Retweet=58, Like=90, Share=121. Each post is 62px tall, and its icon row is always at the post's name y + 49.
- Match posts by the USERNAME span (@user), not the display name. Two posts can share a name but have different handles.
- The feed shows only y≈50..210. A clickxy below ~205 hits nothing, and the episode then fails at Submit. Before clicking a lower post, `press PageDown` (scrolls ~133px), then read the new y values from the printed list and click at new name_y+49. `scroll <id>` does NOT move the feed.
- Click EXACTLY N matching posts, one click per post. A second click probably toggles it off.
- To check, take a screenshot: an active icon turns colored (Share purple, Reply blue).
- Clicking Submit ends the episode, right or wrong. Use `click <submit id>`; it works even when Submit is off-screen. Do it last.

RECIPE
1. Read the list. Pick the first N posts whose username is @<user>.
2. For each one with name_y+49 <= 200: `clickxy <iconX> <name_y+49>`.
3. For the rest: `press PageDown`, read the new name_y values, then `clickxy <iconX> <name_y+49>` (keep the result between 60 and 200).
4. Optionally `screenshot` and check that N icons are colored.
5. `click <Submit id>`.

<!-- stock-market -->
# stock-market notes

RULES
- Any click on Buy ends the episode. Clicking while the live price is NOT below the target scores -1.
- The price changes about every 0.2s and can jump $2-5 per tick. One `mw` call also takes about 0.2s, so the price you saw may be out of date when the click lands. Don't buy when it is only just below. Buy when price < target - 1.5 (go down to -0.8 after ~8s).
- The price feed stops after ~14s and shows "$undefined0". Clicking Buy after that scores -1. Act within ~13s of reset or first observe.
- Don't poll by hand, one tool call at a time: that is too slow. Run one bash loop that observes and clicks.
- Buy button = `button#buy`, usually id 4. The price span id changes every tick, so match on the `stock-price` text, not on its id.

RECIPE (bash, a single tool call; worked 5/5):
```
O=$(mw observe); th=$(echo "$O"|grep -o 'than \$[0-9]*\.[0-9]*'|grep -o '[0-9.]*$')
B=$(echo "$O"|grep 'button#buy'|grep -o '^\[[0-9]*'|tr -d '['); s=$(date +%s)
while :; do e=$(( $(date +%s)-s )); [ $e -gt 14 ] && break
 m=1.5; [ $e -ge 8 ] && m=0.8
 p=$(mw observe|grep -o 'stock-price "\$[0-9.]*'|grep -o '[0-9.]*$'); [ -z "$p" ] && continue
 awk -v p=$p -v t=$th -v m=$m 'BEGIN{exit !(p<t-m)}' && { mw click $B; break; }
done
```
Every task I saw said "less than $<X>". If a task says "more/greater than $<X>", flip the test to p>t+m.

<!-- tic-tac-toe -->
# tic-tac-toe (mw) — RULES

- `mw observe` lists NO cell elements. Use `mw clickxy <x> <y>` on cell centers (seen identically in 3 episodes):
  columns x = 33 / 78 / 123, rows y = 83 / 127 / 171 (top-left 33,83; center 78,127; bottom-right 123,171).
- Do `mw screenshot s.png` + Read it BEFORE your first move: O sometimes has already moved (2 of 3 episodes).
- O replies instantly after each X click; screenshot after EVERY click to see the board (X = cross, O = ring). Ignore the blue dots in the right panel.
- Completing an X line ends the episode at once with reward 1. No submit button.
- Clicking an occupied cell does nothing (no turn lost) — still, don't rely on it.
- O plays weakly (sometimes misses blocks, sometimes blocks). Each move, in this order: (1) win if X has two in a line with the third empty; (2) block if O has two in a line; (3) prefer a move that makes two X threats at once (fork); (4) else center, then corners.
- A draw/loss presumably ends the episode with no reward (untested) — never play carelessly; check all 8 lines before each click.

## Recipe (worked 3/3)
1. `mw screenshot s.png`, Read it.
2. `mw clickxy 78 127` (center; if O took it, take a corner 33 83).
3. screenshot → take a corner that threatens a line through the center (opposite corner empty), unless you must block.
4. screenshot → win if possible, else block O's two-in-a-line (blocks often create an X fork).
5. Repeat until the winning click; `mw reward` should show 1 (episode ended).

<!-- use-autocomplete -->
# use-autocomplete (jQuery UI "Tags:" input + Submit)

RULES
- Clicking Submit ENDS the episode, right or wrong. Submitting a wrong or partial value gives reward -1. Get the full item into the input first.
- The answer is ONE full item from the suggestion list (country names like "Bermuda" or "Slovakia"), NOT the prefix you typed. Pick the item that starts with <prefix> AND ends with <suffix>. If the task gives only a start, any item that starts with it worked.
- `type <input> <prefix>` opens the menu. Then run `observe` to read the items (div.ui-menu-item-wrapper). Several items can match the prefix, so check the ending.
- Fill the input by clicking the item, or with `press ArrowDown` (once per row) then `press Enter`. Neither one submits. Pressing Enter in the input does NOT end the episode.
- TRAP: an open menu covers the Submit button (both near y≈95). If the menu is still open, a click on Submit hits the menu item instead and does not submit. After choosing an item the menu closes. Before clicking Submit, run `observe` and make sure no ul.ui-autocomplete is listed. If you typed the full word yourself, the menu stays open: choose the item from it first.
- Before submitting, check that the input's value= is the full, exact item.

RECIPE (worked 5/5)
1. type <inputId> <prefix>
2. observe → find the item whose text starts with <prefix> and ends with <suffix>
3. click <thatItemId>
4. observe → input value="<FullItem>" and no menu listed
5. click <submitId>

<!-- visual-addition -->
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
