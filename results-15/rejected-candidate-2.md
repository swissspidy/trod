# AppWorld conventions

Learned from graded train-split runs. The tests check the final database state and the answer; these are the rules they expect.

## Before acting
- Every task is solvable from the user's own data. Never finish with "nothing qualifies" and no action, and never ask the user to decide: no one will answer. If your data says nothing fits, your fetch is wrong (missed pages, list endpoint missing details, wrong id field); re-check before going further.
- Changes cannot be undone, so pick the right endpoint first. List the app's APIs (`apis.api_docs.show_api_descriptions(app_name=...)`) and use the one whose name matches the verb in the task: "request money / make requests" = `venmo.create_payment_request`; "send / pay / refund / return money" = `venmo.create_transaction`.

## Reading the task
- **People**: "my friends / roommates / coworkers / manager / sister ..." means phone contacts whose `relationships` contain that word (`apis.phone.search_contacts(relationship=...)`, all pages). Not the Venmo friend list, not a Splitwise group, not people seen in Gmail. "X and Y" is the union of both sets. A named person ("Robert") is the phone contact with that first name. Match records in other apps by these contacts' emails (phone numbers for phone-based apps).
- **Scope**: act on exactly the records the task selects, all of them, and nothing else. No helpful extras (queueing other playlists, messaging people, approving other requests, creating notes). Skip records already in the target state.
- **"A" / "one" record that satisfies a condition**: check the user's records in library order and act on the first one that satisfies it; stop there.
- **Dates**: use the simulated clock (`apis.phone.get_current_date_and_time()`), never the real one. "today" is that calendar day (and its weekday); "last N days including today" means created_at >= today - (N-1) days; "since <date>" is inclusive; "last month" is the previous calendar month; "this year" starts on January 1.

## Sources of truth
- **My data**: "my playlists / songs / library" means the user's own collections (`show_playlist_library`, `show_song_library`, `show_album_library`, all pages), never public search results, even when the task just says "a playlist". If nothing fits perfectly, still pick from the user's own data.
- **Pagination**: list APIs return 5 items per page by default (max page_limit 20). Always fetch all pages; missing pages is a top cause of wrong answers.
- **Search**: `query` parameters are fuzzy and return non-matching rows; always re-filter exactly. List endpoints omit details (song durations, play counts, note content, email bodies); fetch the `show_*` endpoint per id.
- **Spotify**: a playlist's songs are its `song_ids` (or `show_playlist(playlist_id).songs`); get each song's duration, genre, release date, play/like count from `show_song`. Song `duration` is in seconds; divide by 60 for minutes.
- **Notes and files**: notes hold structured text (e.g. a workout plan with one block per weekday giving `duration_mins`, bill shares like "- Name => $12", checklists "[ ] item"); parse the relevant line. File paths start with "~/". When editing a note, rewrite the full content and change only the target line.
- **Bills / receipts in files**: find the file with `file_system.show_directory` (search "~/" with the bill type as substring if no directory is given); the period is in the file name as YYYY-MM, so "last month's bill" is the file named with the previous month. The amount is the "Total Amount => $X" line.

## Money
- Splitting "among my roommates and me" divides by (number of people + 1); round each share to the nearest whole number. Venmo amounts are plain numbers; use the exact description text the task gives.
- To refund or return money use `venmo.create_transaction` to that person's email. Approving a payment request pays from the Venmo balance (pass `payment_card_id` only if the balance is insufficient).
- **Amazon**: `place_order` buys the whole cart. Check `show_cart` first and remove unrelated items unless the task says otherwise. Use `amazon.show_payment_cards` / `show_addresses` ids, not the supervisor's cards.

## Finishing
- Finish with `apis.supervisor.complete_task(answer=...)`. For questions the answer is the bare value: an exact title or name as stored in the app, or a plain number (no units, no "$", no sentence; round only if asked). Action-only tasks: `complete_task()` with no answer, after the action is done.
