# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

There is no application code, build, lint, or test setup here. The workspace holds the configuration and docs for
working with **Zorbit**, the internal order and billing service. Tasks here usually mean querying Zorbit and analysing
what comes back.

- `docs/zorbit.md`: API reference (endpoints and paging)
- `.service/base-url`: Zorbit base URL (currently a local address, `http://127.0.0.1:<port>`)
- `.zorbit/tenant`: the tenant id that every request must send

Read the base URL and tenant id from these files every time. Don't hard-code them, because they can change.

## Calling Zorbit

The tenant goes in the `X-Zb-Tenant` header. The service index (`GET /zb/`) reports this in its `auth` field.

```bash
BASE=$(cat .service/base-url); TENANT=$(cat .zorbit/tenant)
curl -s -H "X-Zb-Tenant: $TENANT" "$BASE/zb/customers?page=1"
```

Endpoints (see `docs/zorbit.md`): `customers`, `regions`, `products`, `orders?from=&to=`, `orders/{id}` (one order with
its lines), `lines?from=&to=`, `refunds?from=&to=`, `fiscal?date=`. The list and date-range endpoints are paged
(`?page=N`), so fetch every page before you compute totals.

## Data gotchas

- Amounts are integers in **minor units (cents)**. Convert only when displaying them.
- The service clock is **UTC-05:00** (the `clock` field in `GET /zb/`). Keep this in mind when you choose `from`/`to`
  dates and group results by day.
- Reporting periods may follow the fiscal calendar (`/zb/fiscal`) rather than calendar months. Check which one a
  request means.
- Refunds come from a separate endpoint. Net revenue means you subtract them yourself.
