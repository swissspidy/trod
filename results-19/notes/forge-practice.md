# Zorbit rules (verified live)

## Access
- Auth is header `X-Zb-Tenant: <.zorbit/tenant>`. Base URL in `.service/base-url`.
- API dates are `DD.MM.YYYY` only (`2026-05-21` → 400 "bad date"). `to` is EXCLUSIVE: `from=21.05.2026&to=28.05.2026` omits the 28th. Pass `to` = last day + 1.
- Paging: `?page=N`, response `{items,page,pages}`, 25 per page; consecutive pages OVERLAP by one record → always de-duplicate by `id`.
- Throttling is silent: after ~4 requests/second the server returns 200 with header `x-zb-throttled: 1` and a TRUNCATED page (13 items). Whenever that header is present, discard the body, sleep ~1.1 s, and refetch. Back off on 429/5xx too.

## Time
- All timestamps (`placed_at`, `voided_at`, `refunded_at`) are naive strings in the service clock, UTC-05:00 fixed (`GET /zb/` shows `"clock":"-05:00"`). UTC = local + 5 h. A question saying "UTC dates" means: convert each timestamp to UTC, then compare dates. Fetch a padded window (from-1 day .. to+2 days) and filter after converting. Orders placed 19:00–23:59 local belong to the NEXT UTC day.
- The fiscal calendar ("the service's own calendar") is in service-local dates: select orders whose LOCAL placed date is within week_start..week_end.
- Fiscal year N starts on a Monday in mid-February of year N (FY2026 week 1 = 2026-02-16..22). Weeks run Mon–Sun, a year has 52 or 53 weeks. `/zb/fiscal?date=DD.MM.YYYY` maps a date → {fiscal_year, week, week_start, week_end (DD.MM.YYYY)}. For a week's dates probe FY start + 7·(week-1) and adjust.

## Data meaning
- Money: `amount_minor`, refund amounts and `list_price_minor` are integer cents. Line `unit_price` is in MAJOR units (float, 48.5 = 4850 cents): multiply by 100 and round.
- Order `amount_minor` = sum of qty·unit_price over ALL its lines, already NET of returns. Returns are lines with NEGATIVE qty in the same order (the order date is what counts, not a return date). Amount 0 (all returned) still counts as an order.
- Revenue for a period = sum of `amount_minor` of non-voided orders placed in the period. Do NOT subtract refunds unless the question says so ("net revenue … minus refunds"). (Confirmed by practice checks.)
- Voided order: `voided_at` not null. Exclude voided orders from revenue, counts, units and returns unless the question explicitly asks for them.
- Units sold net of returns for a product = sum of qty (positive and negative) over its lines in non-voided orders. One order can have several lines for the same product; sum them all. Returned value = sum |qty|·unit_price over negative lines, reported as a positive number of cents.
- Refunds (`/zb/refunds`) are separate money records, dated by `refunded_at` (date issued), NOT by order date, and NOT equal to return lines. `order_ref` "ORD-00589" = order id "o-589" (strip prefix and leading zeros). To attribute a refund to a customer/region, look up the order (`/zb/orders/o-589`), then the customer.
- Regions: `/zb/regions` gives {code, name, legacy_codes}. Customer `region` mixes canonical codes ("ML") and legacy codes ("33" = ML/Varnholt, "91" = PS/Ondrimar, "45" = DX/Brunwick Flats). Always map legacy → canonical before grouping/filtering, or you undercount.
- Per-region answers: key by region NAME, include every region from `/zb/regions` with 0 where none.
- Customer tiers: bronze/silver/gold (lowercase); fetch ALL customer pages.

## Answer shape
- `answer.json` = `{"answer": <value>}`; amounts are integer cents (no floats/strings); maps keyed by names.

## Recipe that passed (6/6 practice: revenue, and per-region order counts, "<from> to <to> (UTC dates, inclusive)")
1. Fetch orders `from=<from-1 day DD.MM.YYYY>&to=<to+2 days>`, all pages (dedupe ids, refetch throttled pages).
2. UTC date = date(placed_at + 5 h); keep `<from> ≤ UTC date ≤ <to>` and `voided_at == null`.
3. Revenue: sum `amount_minor`. Region counts: map customer → canonical region (legacy codes!) → name; start every region at 0.
