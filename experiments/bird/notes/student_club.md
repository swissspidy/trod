# student_club notes

## Schema / joins (all ids are text like 'recXXXX')
- member(member_id, first_name, last_name, email, position, t_shirt_size, phone, zip INT, link_to_major)
  - member.link_to_major = major.major_id ; member.zip = zip_code.zip_code
- major(major_id, major_name, department, college)
- zip_code(zip_code INT, type, city, county, state(full name e.g. 'Illinois'), short_state('IL'))
- event(event_id, event_name, event_date, type, notes, location, status)
- attendance(link_to_event, link_to_member) PK pair, no dups
- budget(budget_id, category, spent, remaining, amount, event_status, link_to_event)
- expense(expense_id, expense_description, expense_date, cost, approved, link_to_member, link_to_budget)
- income(income_id, date_received, amount, source, notes, link_to_member)
- Expense -> event goes via budget: event e JOIN budget b ON b.link_to_event=e.event_id JOIN expense x ON x.link_to_budget=b.budget_id.
- Expense/income -> person: x.link_to_member = member.member_id (the member who "incurred/paid"/"managed budget").
- "Attended" = attendance table. Count attendance with COUNT(link_to_event)/COUNT(link_to_member).

## Values
- member.position: 'Member'(26),'Inactive','President','Vice President','Secretary','Treasurer' (Title Case). "Among the members" => position='Member'.
- t_shirt_size: 'Small','Medium','Large','X-Large' ("extra large"='X-Large').
- event.type: 'Meeting','Game','Social','Guest Speaker','Community Service','Election','Budget','Registration'.
- event.status & budget.event_status: 'Open','Closed','Planning'. "past event"=Closed.
- budget.category: 'Advertisement','Food','Parking','Speaker Gifts','Club T-Shirts'.
- income.source: 'Dues'(33),'Fundraising','Sponsorship','School Appropration'(sic).
- expense.approved: text 'true' (one NULL). expense_description e.g. 'Pizza','Posters','Parking','Post Cards, Posters','Water, Cookies' (exact strings).
- college e.g. 'College of Engineering','College of Education & Human Services','School of Business'.
- phone formats mixed: '809-555-3360' and '(651) 928-4507' -> match the literal given.
- Event names not unique: 'Community Theater','Football game','Laugh Out Loud' appear twice (different dates). Filter by year if asked.

## Dates
- event_date: 'YYYY-MM-DDTHH:MM:SS' -> use SUBSTR(event_date,1,4)='2019', event_date LIKE '2019-10-08%', or date(SUBSTR(event_date,1,10)) BETWEEN ... .
- expense_date, income.date_received: 'YYYY-MM-DD' plain equality/BETWEEN.

## Quantities
- budget: amount = spent + remaining; over budget = remaining < 0. spent = sum of expense costs.
- "total expense/cost" = SUM(expense.cost); "money spent for <category>" = SUM(budget.spent); "budgeted" = budget.amount; "funds received" = income.amount.
- Hometown = zip_code.city (county/state via zip join). Full name = first_name, last_name (two columns).
- Percent: CAST(SUM(CASE WHEN cond THEN x ELSE 0 END) AS REAL) * 100 / SUM(x)  (or / COUNT(id) for share of rows, e.g. COUNT(budget_id)).
- Average: references use AVG(cost) or SUM(spent)/COUNT(spent).

## Output style (references)
- Return just the asked columns, in the order asked; usually no DISTINCT unless listing names of events (they sometimes add DISTINCT for event_name / member_id lists).
- Superlatives: ORDER BY ... DESC LIMIT 1 (no tie handling), or `= (SELECT MAX(...))` subquery.
- Most-attended event: GROUP BY event_name ORDER BY COUNT(link_to_event) DESC LIMIT 1.
- Count members: COUNT(member_id); "more than N events": GROUP BY member HAVING COUNT(link_to_event) > N.
- Department/college/major of a person: join member->major. Major name matching: given name exactly ('Business'); 'education' may be LIKE '%Education%'.
- Use 'Women''s Soccer' quoting for apostrophes.
- 1 member has NULL link_to_major; 19 events have no budget rows (INNER JOIN drops them).
