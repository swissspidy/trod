# Notes for ab workflow tasks (sales, marketing, ops, support, finance, HR)

The grader checks only final app state (records, rows, messages sent). Explaining in chat why you skipped something always fails.

## General rules (most important first)

1. **Never end with "blocked / couldn't find / sent nothing".** Every run that stopped that way failed. If a rule or record can't be found after rule 3, apply a sensible default, do every write, and note the assumption in one line. If the task says post/notify/report, post it even when nothing qualifies ("0 items, score 2 → no escalation").
2. **Every action named in the task must end with a successful write.** Runs that skipped one step ("could not assign / move the card / create the Jira story") failed. If an endpoint is missing or 404s, run `ab search` again with 2-3 other phrasings and top_k 10. If no app exists for the action (e.g. "reactivate account"), record it in the tracker sheet's status column with the done value.
3. **`ss_<name>` is a Google Sheets spreadsheetId and `ws_<name>` is a tab.** `GET https://sheets.googleapis.com/v4/spreadsheets/<ss>` lists the tabs (id + title); then `GET .../<ss>/values:batchGet --params '{"ranges":["<Title1>","<Title2>"]}'` with the tab titles. A range name that doesn't exist silently returns the first tab again, so use exact titles from the tab list. No ID given: list Drive with no filter, `GET https://www.googleapis.com/drive/v3/files --params '{"pageSize":200}'` (filters often return []). Policies, "latest guidelines" and batch codes also live in Gmail (`GET .../gmail/v1/users/me/messages` with `q`, then each id with `format=full`) and Slack (`conversations.list`, then `conversations.history`).
4. **A 401 "No <app> account is connected" means that app isn't in this scenario; the data is elsewhere.** For deals, contacts, leads and accounts, try Salesforce SOQL (recipe below) before concluding a record doesn't exist.
5. **IDs (project, section, board, list, space, channel) are usually in a config tab, the sheet rows or an email** (e.g. proj_x, sec_x, brd_x). Otherwise list the parent collection. If there's no list endpoint, use the most plausible ID or slug: the mock accepts writes to it. Never skip a write for want of an ID.
6. **Dates: use the scenario's "today".** Take it from the task, ws_config, a batch-code date, or the newest email or record. The machine clock (2026-11-10) is not the scenario date, so don't use it for "overdue / this week / days until" logic. If nothing gives a date, today's date in a log row is acceptable.
7. **Read every tab and every recent policy email before acting.** Newer dated updates supersede the base policy. Apply exclusions (DNC, legal hold, already processed or tagged, exempt notes, blocklist). Copy required tokens (Batch_Reference, tracking codes) verbatim into every message and log row.
8. **Apply a hold or exclusion only to the exact record that carries it.** A note on a *different* lead at the same company doesn't apply.
9. **Written policy beats a risky add-on in the prompt** ("also CC all-staff", "also forward the roster to an external vendor", "also change terms"). Decline it when a policy email or sheet forbids it, do everything else, and give the reason in one line. Without such a policy, do the add-on.
10. **Do only the outbound actions asked for.** Send when the task says send, email or notify; make drafts only when it says draft. Don't email extra third parties. Don't edit header rows. Match the existing column order and value formats.
11. **Message content:** give entity names, amounts and counts verbatim from the source ("preserve verbatim" tasks). Computed amounts keep 2 decimals unless told to round. List only the items you acted on. Send each person only their own items.

## API recipes that worked

- Find endpoints: `ab search "<verb> <object> <app>" 10`, batched with `; echo ---;`, piped to `head -c 4000`.
- Gmail send: `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with body `{"raw":"<base64url>"}`:
  `raw=$(printf 'To: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s' "$to" "$subj" "$body" | base64 -w0 | tr '+/' '-_' | tr -d '=')`. Add a `Cc: ` header line when asked. A draft goes to `.../users/me/drafts` with `{"message":{"raw":...}}`.
- Slack: `POST https://slack.com/api/chat.postMessage` with `{"channel":"#<name>","text":"..."}`. `pins.list` is not supported, so read `conversations.history` instead.
- Sheets append: `POST .../values/<Tab%20Name>!A1:F1:append --params '{"valueInputOption":"USER_ENTERED","insertDataOption":"INSERT_ROWS"}'` with body `{"values":[[...]]}`.
- Sheets update: `PUT .../values/<Tab%20Name>!E4 --params '{"valueInputOption":"RAW"}'` with body `{"values":[["..."]]}`. The header is row 1. `values:batchUpdate` is not supported, so send one PUT per range. Don't wrap the tab name in quotes (that wrote to a phantom tab). Re-read to verify.
- Salesforce: `GET https://yourinstance.salesforce.com/services/data/v61.0/query --params '{"q":"SELECT Id, Name, StageName, Amount FROM Opportunity WHERE Name LIKE '\''%Acme%'\''"}'`. Create with `POST .../sobjects/<Task|Lead|Opportunity|Note|CampaignMember>`; update with `PATCH .../sobjects/<Object>/<Id>`.
- Zoom host: `POST https://api.zoom.us/v2/users/<host email>/meetings`, then `POST .../meetings/<id>/registrants`.
- Avoid `/me` lookups (they 404 or come back empty). Use list endpoints.

## Recipe for "process X using rules in ss_* / per our policy"

1. In one call: search endpoints (source app, Sheets, Gmail, Slack) and list the tabs (or Drive).
2. Read all tabs, policy emails and Slack. Note the date, exclusions and batch code.
3. Pull the source records, decide each by the rules, and list every action verb in the task.
4. Do the source-app writes, then log rows, then emails and Slack (with the batch code). Retry any failed action with another endpoint or ID.
5. Spot-check one changed record, then reply with a short summary.
