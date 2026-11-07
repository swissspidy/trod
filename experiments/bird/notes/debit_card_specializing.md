# debit_card_specializing — notes

## Tables (all FKs clean, no NULLs, no stray spaces)
- customers(CustomerID PK, Segment, Currency): Segment ∈ 'KAM','LAM','SME' (client segment); Currency ∈ 'CZK','EUR' (uppercase; "euro" → 'EUR', Czech crown → 'CZK'). 32461 rows.
- gasstations(GasStationID PK, ChainID, Country, Segment): Country ∈ 'CZE','SVK' (Czech Republic → 'CZE', Slovakia → 'SVK'). Segment ∈ 'Premium','Value for money','Discount','Noname','Other' (case exact). "chain no. 11" → ChainID = 11.
- products(ProductID PK, Description): Czech names ('Nafta'=diesel, 'Natural'=petrol, 'Natural +', 'Diesel +', ...).
- transactions_1k(TransactionID, Date 'YYYY-MM-DD' text, Time 'HH:MM:SS' text, CustomerID, CardID, GasStationID, ProductID, Amount INT, Price REAL). Only 1000 rows, dates 2012-08-23..2012-08-26 only.
- yearmonth(CustomerID, Date 'YYYYMM' text e.g. '201304', Consumption REAL), PK(Date,CustomerID). Dates 201112..201311. 152 rows have negative Consumption (keep them; references don't filter).

## Date handling
- Transaction date '2012/8/24' → `Date = '2012-08-24'`; time → `Time = '16:25:00'` (zero-padded). Year: `STRFTIME('%Y', Date)`.
- yearmonth: month → `Date = '201201'`; year → `SUBSTR(Date,1,4) = '2012'` (references use SUBSTR; BETWEEN '201201' AND '201212' equivalent); month part `SUBSTR(Date,5,2)`.
- "Consumption"/"expenses"/"spent" for a month or year → yearmonth.Consumption. "Paid/price/revenue/transaction" → transactions_1k.Price.

## Price semantics
- Price is effectively the TOTAL paid for the transaction line (e.g. Amount 28, Price 672.64). Revenue / amount spent = `SUM(Price)`; "average total price" = `AVG(Price)`; unit price = Price/Amount. "most expensive product X for one unit" in reference was simply `ORDER BY Price DESC LIMIT 1`. Reference for "average price per single item" used `SUM(T2.Price / T2.Amount)` (follow the literal formula given in the question if any).

## Join patterns
- transactions_1k.CustomerID → customers / yearmonth; GasStationID → gasstations; ProductID → products.
- References often add an unneeded INNER JOIN to gasstations (harmless: every transaction has a station).
- Joining transactions_1k to yearmonth multiplies rows (one per month); filter yearmonth.Date when needed.
- Country of a card/customer = via gasstations.Country of their transactions.

## Aggregation / output conventions
- "Who consumed the most/least" → GROUP BY CustomerID, ORDER BY SUM(Consumption) DESC/ASC LIMIT 1, return CustomerID (plus the SUM if "how much" asked).
- "Peak month"/"which year" → GROUP BY SUBSTR(Date,5,2) or SUBSTR(Date,1,4), select that substring, ORDER BY SUM(Consumption) DESC LIMIT 1.
- "Highest monthly consumption in 2012" → SUM per month across customers (GROUP BY month) DESC LIMIT 1.
- "Monthly consumption" sometimes defined as SUM(Consumption)/12 per customer.
- Top customer overall (reference): `SELECT CustomerID FROM yearmonth ORDER BY Consumption DESC LIMIT 1` (single-row max).
- "Earliest customer" → ORDER BY transactions_1k.Date ASC LIMIT 1.
- Difference between two customers: `SUM(IIF(CustomerID=7,Consumption,0)) - SUM(IIF(CustomerID=5,Consumption,0))`.
- Percentages: `CAST(SUM(IIF(cond,1,0)) AS FLOAT) * 100 / COUNT(x)` — counts rows (customer-month rows of yearmonth), not distinct customers, unless a month filter makes them equal.
- Counting customers with yearly condition: subquery GROUP BY CustomerID HAVING SUM(...) then COUNT(*).
- Counting stations: `COUNT(GasStationID)` with Country/Segment filters.
- "List the disparate/different X" → SELECT DISTINCT. Lookups by date+time that could hit several rows: references use DISTINCT only when asked about a customer attribute (e.g. Currency); otherwise plain SELECT.
- Return only the asked columns, in question order; LIMIT 1 for superlatives (no tie handling).
- CardID/CustomerID literals in references sometimes quoted ('667467') — works either way.
