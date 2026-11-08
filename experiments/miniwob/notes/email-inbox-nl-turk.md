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
