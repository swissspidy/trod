# email-inbox-nl-turk notes

RULES
- The first final action ends the episode (reward 1 if right). Check the task text and the open message before it.
- `mw observe` lists every row of the list, including off-screen ones. Scrolling did nothing; don't bother.
- Tasks seen: (a) "Find and remove the email from <X>", (b) "Search for an email written by <X> and send that email to <Y>", (c) "Mark the email that I sent to <X> ... as important". Wording varies; act on the sender named.
- List row: sender at `div.email-sender`; click its id to open the message. Detail view: Reply @31,182, Forward @88,182 (clickxy).
- Detail view top-right icon at clickxy 146 62: removes the message (task a). In the forward form it is the SEND button.
- Back arrow: clickxy 7 62 returns to the list.
- Forward: click Forward, `type <input.forward-sender id> <Y>` (exact first name works, no autocomplete needed), then clickxy 146 62 to send.
- Task (c): if no mail is "sent" (all rows say "to me"), the only match for the name is the one from that person. Click the star icon on that row at clickxy 123 <row y> (row y ~ 125 for the second row); this solved it.
- Search (icon clickxy 143 61) works, but matches sender names only.
- Don't click the h2 "Primary" header; it does nothing.

RECIPE (forward): observe -> click <sender row id> -> clickxy 88 182 -> type <forward-sender id> <recipient> -> clickxy 146 62.
RECIPE (remove): observe -> click <sender row id> -> clickxy 146 62.
