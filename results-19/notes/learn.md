# Zorbit tasks: rules (checked against the live service)

Tasks ask for a number or a dict computed from the Zorbit API. Base URL: `.service/base-url`. Tenant: `.zorbit/tenant`. Write `answer.json` in the work dir as `{"answer": <value>}`, then reply DONE.

1. **Auth:** send the tenant in the header `X-Zb-Tenant: <tenant>`. `X-Tenant` and `X-Tenant-Id` get `{"error":"bad request"}` (`GET /zb/` names the header).
2. **Date params are `DD.MM.YYYY`**, e.g. `/zb/orders?from=19.08.2026&to=26.08.2026` or `/zb/fiscal?date=19.08.2026`. ISO, compact and US formats all return `bad date`. Earlier sessions never found this: 4 fiscal tasks failed and the rest paged through all data. `to` is EXCLUSIVE, and the filter compares the raw local `placed_at`/`refunded_at` date.
3. **Timestamps are local -05:00 with no offset** (the index says `"clock":"-05:00"`). Add 5h to get UTC before you apply a task's date window. A UTC window D1..D2 (inclusive) is local D1-1 19:00 to D2 19:00, so fetch `from=<D1-1>&to=<D2+1>` and filter locally after converting. Treating the timestamps as UTC failed 3 sessions.
4. **Throttling silently truncates pages.** A response with header `x-zb-throttled: 1` is short: a full page has 25 items, and these come back with 13 or 10. Sleep about 2-3s between requests, check the headers (`curl -i`), refetch until you have no throttled page, and use `pages` from the body. Fetching each page once undercounted (customers: 119 instead of 140).
5. **Pages overlap by one record:** deduplicate by `id`. Customer ids run c-101..c-240 and order ids o-1..o-1300; check the id range for gaps.
6. **Exclude voided orders** (`voided_at` not null) from revenue, counts, units and returns. Including them failed 2 sessions.
7. **Regions:** `/zb/regions` gives `code`, `name` and `legacy_codes`. Customers use either the code or a legacy code (ML=33, PS=91, DX=45), so match both. An order's region comes from its customer's record.
8. **Money:** `amount_minor` is cents. Line `unit_price` is in MAJOR units: multiply by 100 (66.5 → 6650). The same product can appear on several lines of one order; sum them all.
9. **Store data in a private dir** (`D=$(mktemp -d)`), never in a fixed path like `/tmp/zb`. Parallel sessions overwrote each other's files there, and one session failed.
10. **Always write a best answer.** Giving up without `answer.json` always failed. In the summary, mention the alternative reading.

## Recipes
- **Revenue in <window>:** sum `amount_minor` of non-voided orders whose UTC `placed_at` is in the window, both ends inclusive.
- **Count customers by <tier> in <region>:** get all customer pages (rules 4-5), then match tier and region code or legacy code.
- **Orders per region:** `{"answer": {"<Region name>": n, ...}}` with every region in it, including zeros. Go order → customer → region (map legacy codes to the region).
- **Returned value / returned units:** returns are order lines with negative `qty` (refunds have money only, so don't use them). Value = Σ|qty|·unit_price·100 over non-voided orders placed in the window.
- **Net units of <product>:** find the code in `/zb/products`. Take Σqty over non-voided in-window lines; negative lines subtract themselves.
- **Customer net revenue:** that customer's non-voided order amounts in the window, minus refunds whose `refunded_at` is in the window. A refund's `order_ref` `ORD-00297` is order `o-297`.
- **Region refunds:** refund → order (`order_ref`) → customer → region. Filter on `refunded_at`.
- **Fiscal week <N> of FY<Y>:** weeks run Monday to Sunday. FY2026 week 1 = 16.02.2026 (FY2027: 15.02.2027), so week N starts at week 1 + 7(N-1) days. Confirm with `/zb/fiscal?date=<DD.MM.YYYY>`, which returns `week_start` and `week_end`. Then apply the revenue recipe over that span. If the task gives the window in UTC, convert from -05:00 local first.
