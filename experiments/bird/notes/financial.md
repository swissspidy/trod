# financial DB notes (Czech bank, 1993-1998)

## Schema / joins
- account(account_id, district_id, frequency, date) ; client(client_id, gender, birth_date, district_id)
- disp(disp_id, client_id, account_id, type) links client<->account. card.disp_id -> disp. loan/order/trans .account_id -> account.
- district(district_id, A2..A16). `order` is a reserved word: write `order` in backticks.
- Client->district: reference SQL usually joins client.district_id = district.district_id directly ("client's district/branch").
  Account->district via account.district_id (account branch). They differ for ~9% of owners, so pick based on which entity the question is about.
- Card->client: card JOIN disp ON disp_id JOIN client. Card->transactions: card->disp->account->trans (by account_id).
- 1 loan per account (682 loans). 1 disp per client. Each account has exactly 1 OWNER; card per disp is unique.

## Coded values (exact case)
- disp.type: 'OWNER' (4500), 'DISPONENT' (869). No 'USER' rows. "eligible for loans / account holder" = 'OWNER'; "not eligible" = type != 'OWNER'.
- account.frequency: 'POPLATEK MESICNE' monthly, 'POPLATEK TYDNE' weekly, 'POPLATEK PO OBRATU' after transaction.
- client.gender: 'F' / 'M'.
- card.type: 'junior', 'classic', 'gold' (gold = high-level).
- loan.status: 'A' finished OK, 'B' finished not paid, 'C' running OK, 'D' running in debt. Running/active = IN ('C','D').
- loan.duration in months: 12,24,36,48,60. amount in USD; payments = monthly payment.
- trans.type: 'PRIJEM' credit, 'VYDAJ' withdrawal (also 'VYBER' 16666 rows; reference used only 'VYDAJ').
- trans.operation: 'VYBER KARTOU' card withdrawal, 'VKLAD' cash credit, 'PREVOD Z UCTU' collection from other bank, 'VYBER' cash withdrawal, 'PREVOD NA UCET' remittance; NULL often.
- trans.k_symbol: 'POJISTNE','SLUZBY','UROK','SANKC. UROK','SIPO','DUCHOD','UVER', plus NULL and ' ' (one space).
  `order`.k_symbol: 'SIPO','UVER','LEASING','POJISTNE', and '' (empty).
- trans.balance = balance after the transaction ("sum/how much the account has").
- district: A2 = district name, A3 = region ('Prague','central Bohemia','east Bohemia','north Bohemia','north Moravia','south Bohemia','south Moravia','west Bohemia' ), A4 inhabitants (TEXT! CAST for numeric compare/sort; A5-A7 also TEXT), A10 urban ratio, A11 average salary, A12/A13 unemployment 1995/1996, A14 entrepreneurs per 1000, A15/A16 crimes 1995/1996. A12 and A15 have one NULL (district 69).
  "district" may mean A2 even when hints say A3; "region" = A3. "branch" = district_id / district.

## Dates
- All dates are 'YYYY-MM-DD' text (docs say YYMMDD — wrong). Compare with literals: date = '1996-10-21'; years: STRFTIME('%Y', date) = '1997' (string). "after 1996" -> >= '1997-01-01'. Card date = card.issued.
- Age: STRFTIME('%Y', CURRENT_TIMESTAMP) - STRFTIME('%Y', birth_date). Oldest = ORDER BY birth_date ASC; youngest = DESC.

## Output conventions in reference SQL
- Return only the asked columns, in question order (e.g. "loan ID, district and average salary" -> loan_id, A2, A11).
- Usually no DISTINCT unless "different/distinct"; DISTINCT used for listing district names via trans joins.
- COUNT(T1.account_id) / COUNT(client_id) without DISTINCT.
- Percentage: CAST(SUM(cond) AS REAL) * 100 / COUNT(x)  or  CAST(SUM(CASE WHEN cond THEN amount ELSE 0 END) AS REAL) * 100 / SUM(amount).
- Growth/increase rate: CAST((SUM(CASE WHEN yr='B' THEN v ELSE 0 END) - SUM(CASE WHEN yr='A' ...)) AS REAL) * 100 / SUM(CASE WHEN yr='A' ...). IIF also used.
- Count by two types in one row: SELECT SUM(type='OWNER'), SUM(type='DISPONENT') ...
- Superlatives: ORDER BY ... LIMIT 1 (no tie handling). Top-N grouped: GROUP BY district_id, A2 ORDER BY COUNT(...) DESC LIMIT N, output both name and count.
- "highest X loan by district": GROUP BY A3/A2 ORDER BY SUM(amount) DESC LIMIT 1.
- Loan + male-client aggregates sometimes add disp.type='OWNER' to avoid double counting.
- "debited" amounts -> `order`.amount; transactions -> trans.amount.
