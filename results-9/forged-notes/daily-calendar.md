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
