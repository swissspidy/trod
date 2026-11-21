# Zorbit: what every session must know

- Send the tenant id in an `X-Zb-Tenant` header on every request.
- Date filters are DD.MM.YYYY, and `to` is exclusive: for an inclusive end date pass the day after.
- Timestamps (placed_at, refunded_at) and date filters use the service clock, UTC-05:00, with no marker. Convert to UTC before deciding which UTC date something falls on; query one extra day on each side and filter yourself.
- Voided orders are listed like the others (voided_at is set). They are not revenue and do not count as orders; `?live=1` leaves them out.
- Paged endpoints repeat the previous page's last item at the top of the next page: de-duplicate by id.
- More than 4 requests in one second makes paged responses silently return half a page (header `x-zb-throttled: 1`). Sleep 0.4 s between requests and refetch any page that carries that header.
- Order lines give `unit_price` in major units (12.5 = 1250 cents); every other amount is integer cents.
- A return is an order line with negative qty; there is no returns endpoint.
- Refunds reference orders as `ORD-00123` for order `o-123`.
- Some customers carry a region's legacy code: 33 = ML (Varnholt), 91 = PS (Ondrimar), 45 = DX (Brunwick Flats). Map those to the region before grouping.
- Fiscal weeks start on the fiscal year's first day (2026-02-16 for FY2026), not on Monday; use `/zb/fiscal?date=`.
