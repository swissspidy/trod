# Zorbit — rules for answering data questions

## Access & paging
- Auth is header `X-Zb-Tenant: <.zorbit/tenant>` (GET /zb/ says so). Without it you get 400 "bad request".
- Page size is 25 and consecutive pages OVERLAP by one record (page 2 starts with page 1's last item). Always dedupe by `id`; never sum raw page contents.
- Rate limit is SILENT: after a burst of ~4 requests faster than ~4/s the server returns 200 with a TRUNCATED page (13 of 25 items, same `pages`). No 429. Pace requests >=300 ms apart, serially (parallel calls share one budget); treat any non-last page with <25 items as truncated and re-fetch after ~1 s.
- Unknown customer/order id -> 404 {"error":"not found"}.

## Dates & time zone
- The service clock is fixed UTC-05:00 (`clock` in GET /zb/). `placed_at`, `voided_at`, `refunded_at` are local "YYYY-MM-DD HH:MM:SS" with no zone. UTC = local + 5 h. A question in "UTC dates" must be filtered on the converted UTC date: an order at local 2026-05-01 20:00 is UTC 2026-05-02.
- Query params `from`/`to`/`date` use DD.MM.YYYY (ISO gives "bad date"). The server filters on LOCAL dates and `to` is EXCLUSIVE. For a UTC range [F,T] fetch local from=F-1 day, to=T+2 days, then filter by UTC date yourself.
- Fiscal calendar = GET /zb/fiscal?date=DD.MM.YYYY (service-local dates). Weeks run Mon..Sun; fiscal year N starts on the first Monday on/after 15 Feb of year N (FY2026 wk1 = 2026-02-16..22, wk31 = 2026-09-14..20). Jan/early Feb belong to the PREVIOUS fiscal year. "Fiscal week as finance counts it / service calendar" -> select by the LOCAL placed_at date within week_start..week_end, not UTC.

## Records & meaning
- Order `amount_minor` (cents) = sum of its lines qty*unit_price, ALREADY NET of return lines. Do not subtract returns again.
- Line `unit_price` is in MAJOR units (72.5 = 7250 cents); multiply by 100 and round. Negative `qty` = units returned within that order (always matches a positive line of the same product). Duplicate-looking lines (same product, same qty, different line id) are real separate lines; keep both.
- Voided order = `voided_at` not null. Voided orders are not sales: exclude them from revenue, order counts, units sold/returned, unless the question explicitly includes them. No refunds point at voided orders.
- Refunds are separate money events dated by `refunded_at` (local); `order_ref` "ORD-00422" means order id "o-422". Refund amounts are positive cents and are NOT in order amounts and NOT equal to returned-line values.
- Customer `region` may be a LEGACY code: "33"=ML Varnholt, "91"=PS Ondrimar, "45"=DX Brunwick Flats (see /zb/regions legacy_codes). Always map to the canonical region before grouping or filtering, otherwise you undercount.
- A refund/order belongs to the region and tier of the ORDER's customer.
- Tiers are lowercase "bronze"/"silver"/"gold". Customer names and product names are unique; match exactly.

## Definitions to use
- Revenue (orders placed in period) = sum of amount_minor of non-voided orders placed in the period. Do not subtract refunds unless asked.
- Net revenue "orders minus refunds" = that revenue minus refunds whose refunded_at falls in the period (refund date, not order date), for the same customer/region scope.
- Units sold net of returns = sum of qty (positive and negative lines) of non-voided orders placed in the period. Returned value = sum |qty| * unit price of negative lines, reported positive.
- Per-region answers: include every region from /zb/regions (6 regions), with 0 where none; key by region NAME.
- Answers: amounts as integer cents; counts as integers.
