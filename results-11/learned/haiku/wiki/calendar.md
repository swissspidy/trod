# Calendar: create a timed event

- Dragging on an empty hour cell opens the "New event" popup. The drag start sets the start time. The default span was not the one the task asked for.
- Results: 90-minute tasks failed (057, 067). A 60-minute task failed (075): the draft kept a 90-minute span, and resizing the edge or clicking the end label changed nothing. The one pass (076, 30 minutes) dragged from 4:30pm to 5pm, typed the name, and clicked Create.
- Recipe: drag from the exact start slot to the exact end slot. Before Create, check the popup's start and end text. If wrong, close it and redo the drag at the right slots; do not keep resizing.
- 057 hit the 60-action limit after many drags. After 3 failed attempts, change the gesture or take a screenshot; do not repeat the same drag.
