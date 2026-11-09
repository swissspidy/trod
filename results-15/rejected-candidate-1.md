# AppWorld conventions

Learned from graded train-split runs. The tests check the final database state and the answer; these are the rules they expect.

## Reading the task
- **People**: "my friends / roommates / coworkers / manager / sister ..." means phone contacts whose `relationships` contain that word (`apis.phone.search_contacts(relationship=...)`, all pages). Not the Venmo friend list, not a Splitwise group, not people seen in Gmail. "X and Y" is the union of both sets. A named person ("Robert") is the phone contact with that first name. Match records in other apps by these contacts' emails (phone numbers for phone-based apps).
- **Scope**: act on exactly the records the task selects, all of them, and nothing else. No helpful extras (queueing other playlists, messaging people, approving other requests, creating notes). Skip records already in the target state.
- **Always act**: an action task is never satisfied by doing nothing or by explaining why nothing fits. If no candidate fits perfectly, still perform the action on the best candidate from the user's own data, then call `complete_task`.
- **Dates**: use the simulated clock (`apis.phone.get_current_date_and_time()`), never the real one. "today" is that calendar day (and its weekday); "last N days including today" means created_at >= today - (N-1) days; "since <date>" is inclusive; "last month" is the previous calendar month; "this year" starts on January 1.

## Data access
- **Pagination**: list APIs return 5 items per page by default (max page_limit 20). Always fetch all pages; missing pages is a top cause of wrong answers.
- **Search**: `query` parameters are fuzzy and return non-matching rows; always re-filter exactly. List endpoints omit details (song durations, play counts, note content, email bodies); fetch the `show_*` endpoint per id.
- **Superlatives** (most/least/longest/oldest): compute them in code (`min`/`max` over the full fetched list, or the API's `sort_by="+field"` / `"-field"`), never by eyeballing a printed list. Check the chosen record before submitting; `complete_task` is final and cannot be corrected afterwards.
- **Notes and files**: notes hold structured text (e.g. a workout plan with a block per weekday and a `duration_mins:` line, bill shares like "- Name => $12", checklists "[ ] item"/"[x] item"); parse the relevant line. File paths start with "~/". When editing a note, rewrite the full content and change only the target line.

## Spotify
- **My data**: "my playlists / songs / library" and "a playlist" to play for the user mean the user's own collections (`show_playlist_library`, `show_song_library`, `show_album_library`, all pages), never public search results or other users' playlists. If nothing fits perfectly, still pick from the user's own data.
- **Named catalog items**: a named artist or album that is not "mine" comes from the public catalog (`search_artists` / `search_albums`, take the exact-name match); songs by an artist can be filtered with `search_songs(artist_id=..., sort_by=...)`.
- **Durations**: song `duration` is in seconds; convert (/60, round) only when the answer is asked in minutes. To find a playlist "long enough" for a required length, go through the user's playlist library in library order, sum `show_song(id).duration` over its `song_ids`, compare that sum directly with the number from the plan (the grader does no unit conversion), and play the first playlist that passes with `play_music(playlist_id=...)`.

## Money and shopping
- **Money**: splitting "among my roommates and me" divides by (number of people + 1). Venmo amounts are plain numbers. To refund or return money use `venmo.create_transaction` to that person's email. Approving a payment request pays from the Venmo balance (pass `payment_card_id` only if the balance is insufficient).
- **Amazon**: `place_order` buys the whole cart. Check `show_cart` first and remove unrelated items unless the task says otherwise. Use `amazon.show_payment_cards` / `show_addresses` ids, not the supervisor's cards.

## Finishing
- **Answer**: finish with `apis.supervisor.complete_task(answer=...)`. For questions the answer is the bare value: an exact title or name as stored in the app, or a plain number (no units, no "$", no sentence; round only if asked). Action-only tasks: `complete_task()` with no answer.
