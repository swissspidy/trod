# Daily calendar ("Create a 90 mins event named "Gym", between 8AM and 12PM")

All four sessions struggled, and two used up the 60 actions or gave up. Here is what was learned:
- The listing has `span.hour-label` rows 41px apart (one hour ≈ 41px, 30 min ≈ 20px). The grid is taller than the view, so `hover`/`scroll` an hour label to bring the window into view. y values in the listing are viewport-relative after scrolling.
- `dragxy <x> <y_start> <x> <y_end>` in the event column opens a "New event" popup that has a name input and start/end times. Its duration did not always follow the drag: a 20px drag from 4pm gave 1 hour, and a drag from the 4:30 slot to 5pm gave 30 min (that session succeeded).
- **Before clicking Create, read the start/end times in the popup from the listing.** If the duration is wrong, cancel and drag again from a different start slot. Don't click Create on a wrong duration (one session saved 90 min instead of 60).
- Fill the name with `type <name input id> <Name>`, then `click <Create id>`. That click ends the episode.
- Budget about 25 actions for this. Don't spend actions on resizing an event's edge, clicking time labels, or double-clicking: none of them changed the time.
