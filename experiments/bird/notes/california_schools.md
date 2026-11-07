# california_schools notes

## Tables & joins
- `schools` (17686 rows, PK CDSCode 14-char text). Includes district/office rows where School IS NULL (1369; SOC/EdOps NULL too).
- `frpm` (9986, PK CDSCode, all `Academic Year`='2014-2015'). Join `frpm.CDSCode = schools.CDSCode`. Column names have spaces → backticks: `` `Enrollment (K-12)` ``, `` `FRPM Count (Ages 5-17)` ``, `` `School Name` ``, `` `County Name` ``, `` `Charter Funding Type` ``.
- `satscores` (2269, PK cds). Join `satscores.cds = schools.CDSCode` (or frpm.CDSCode). rtype 'S'=school, 'D'=district (sname NULL for D). 211 cds lost leading zero (13 chars) and don't join — just use the plain join, refs do.
- Reference style: aliases T1/T2, INNER JOIN; no DISTINCT unless asked; return only the asked columns, in question order (e.g. "email ... Provide the name" → `AdmEmail1, School`).
- `schools.County` = frpm.`County Name`. satscores-only queries: name = sname (add `sname IS NOT NULL`).

## Codes (schools)
- StatusType: 'Active','Closed','Merged','Pending'.
- DOC (text, `DOC = 52` works): 00 COE, 31 State Special Schools, 52 Elementary School District, 54 Unified, 56 High School District, ... 
- SOC (text): 31 State Special Schools, 60 Elementary, 62 Intermediate/Middle, 65 K-12, 66 High Schools (Public), 68 Continuation, 69 District Community Day Schools, 11 Youth Authority Facilities, 09 Special Ed; SOCType = name. frpm.`School Type` holds same names as SOCType.
- EdOpsCode/EdOpsName: TRAD, SSS (State Special School), SPECON (District Special Education Consortia School), YTH (Youth Authority School), CON, COMMDAY, ALTSOC, JUV, OPP, SPEC, HOMHOS, ROP. Same names in frpm.`Educational Option Type`.
- EILCode: ELEM, HS, INTMIDJR, ELEMHIGH, UG, A, PS.
- Virtual: 'F' = fully virtual (no physical building), 'P' partial, 'N' not virtual.
- Magnet: 1 yes / 0 no. Charter: 1/0; FundingType 'Directly funded','Locally funded','Not in CS funding model'.
- GSoffered/GSserved like 'K-8','9-12','K-12','P-5'. Zip '95203-3704' or '94541'. Phone '(510) 748-4008', Ext separate.
- Dates 'YYYY-MM-DD' text: year via `strftime('%Y', OpenDate) = '1980'`; compare `OpenDate > '2000-01-01'`.
- Address: Street/City/Zip/State; MailStreet = unabbreviated mailing street (MailStrAbr abbreviated).
- Administrators: AdmFName1/AdmLName1/AdmEmail1 (use the "1" columns).
- NCESDist text like '0613360'.

## frpm
- `Charter School (Y/N)` 1/0; `Charter Funding Type` 'Directly funded'/'Locally funded'.
- `Low Grade`/`High Grade` TEXT ('K','P','9','12','Adult'); `Low Grade` = 9 works by affinity.
- `NSLP Provision Status`: 'Provision 2','CEP','Multiple Provision Types', NULL...
- "grades 1-12" / "K-12 students" → `(K-12)` columns. "ages 5-17" → `(Ages 5-17)` columns.
- Enrollment/counts are REAL; no zero enrollments. Percent columns are fractions (0.65), not 0-100.
- Rates as refs compute them: eligible free rate = `CAST(\`Free Meal Count (K-12)\` AS REAL) / \`Enrollment (K-12)\``; FRPM rate = `FRPM Count / Enrollment`; "percent" = `... * 100 / ...`. Compute from counts.
- "Total enrollment" was defined once as `Enrollment (K-12)` + `Enrollment (Ages 5-17)`.

## satscores
- NumTstTakr (218 zeros), NumGE1500 (SAT total >= 1500), AvgScrRead/Math/Write (NULL where no takers), enroll12, sname/dname/cname.
- Excellence rate = `CAST(NumGE1500 AS REAL) / NumTstTakr`.
- For "lowest average score" add `AvgScrRead IS NOT NULL` before `ORDER BY ... ASC LIMIT 1`.

## Output patterns
- Superlatives: `ORDER BY col DESC LIMIT 1` (top N: LIMIT N), not MAX subquery/ties.
- Counts: `COUNT(T1.CDSCode)` or COUNT(School); ratio of counts: `CAST(SUM(CASE WHEN County='Colusa' THEN 1 ELSE 0 END) AS REAL)/SUM(CASE WHEN ...)`.
- Averages per month etc.: `CAST(COUNT(School) AS REAL) / 12`.
- "List X along with Y if any" → LEFT JOIN from schools.
- Questions may say "schools in X" for city (`City`) vs county (`County`) — "county of X" → County; "city/in Fresno city" → City; "Fresno Unified" → District.
