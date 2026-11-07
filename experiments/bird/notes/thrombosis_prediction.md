# thrombosis_prediction notes

## Tables
- **Patient**(ID PK, SEX 'F'/'M'/'', Birthday, Description=date data first recorded, `First Date`=first hospital visit, Admission '+'=inpatient/admitted, '-'=outpatient, Diagnosis). 1238 rows.
- **Laboratory**(ID, Date) PK; 13.9k rows, 302 patients, all IDs in Patient.
- **Examination**: ID not unique, sometimes NULL. Only 70 rows join Patient; only 20 IDs also in Lab. Tiny 3-way join results are expected.
- Backtick-quote: `First Date`, `Examination Date`, `T-BIL`, `T-CHO`, `U-PRO`, `aCL IgG`/`aCL IgM`/`aCL IgA`, `ANA Pattern`.
- Dates are TEXT 'YYYY-MM-DD'.

## Codes
- Thrombosis: 0=none, 1=most serious, 2=severe, 3=mild. "Severe" was 1 or 2.
- KCT/RVVT/LAC '+'/'-'/NULL; positive coagulation = any of the three = '+'.
- Symptoms NULL = no symptoms. "Has symptoms" = `Symptoms IS NOT NULL`.
- Diagnosis case differs: Patient 'SJS','BEHCET'; Examination 'SjS','Behcet'. Combos like 'SLE, SJS'. Use `Diagnosis='SLE'`, not LIKE. Default to Patient.Diagnosis; use Examination.Diagnosis when tied to an exam date.
- SM/SC170/RNP/SSA/SSB/CENTROMEA: 'negative','0' or numbers. Normal = `IN ('negative','0')`; abnormal = `NOT IN ('negative','0')`. Don't use '-'/'+-' though docs say so.
- RA: '-','+-','+','2+'. CRP: '-','+','<0.3',numbers.
- RF and `U-PRO` are TEXT, but refs compare numerically (`RF < 20`, `` `U-PRO` > 0 AND `U-PRO` < 30 ``). Copy that.

## Normal ranges
| Range | Tests |
|---|---|
| <60 | GOT, GPT |
| <500 | LDH |
| <300 | ALP |
| <30 | UN |
| <1.5 | CRE |
| <2.0 | `T-BIL` |
| <250 | `T-CHO`, CPK |
| <200 | TG |
| <180 | GLU |
| <14 | PT |
| <45 | APTT |
| <20 | RF |
| <8 | DNA |
| 6.0–8.5 | TP |
| 3.5–5.5 | ALB |
| 3.5–9.0 | WBC |
| 3.5–6.0 | RBC |
| 10–17 | HGB |
| 29–52 | HCT |
| 100–400 | PLT |
| 150–450 | FG |
| 900–2000 | IGG |
| 80–500 | IGA |
| 40–400 | IGM |
| >35 | C3 |
| >10 | C4 |

- Abnormal = complement with inclusive bounds: `WBC <= 3.5 OR WBC >= 9.0`; high = `T-CHO >= 250`.
- Normal may be `BETWEEN 3.5 AND 9`.
- UA high: M `>8.0`, F `>6.5`.

## Formulas
- Age = year difference:
  - now: `STRFTIME('%Y', CURRENT_TIMESTAMP) - STRFTIME('%Y', T1.Birthday)`
  - at test: `STRFTIME('%Y', T2.Date) - STRFTIME('%Y', T1.Birthday)`
- Year filter: `STRFTIME('%Y', Date) = '1998'`. Month: `Date LIKE '1991-10-%'`.
- Youngest: `ORDER BY Birthday DESC`.
- Durations: year diff of `Examination Date` and `First Date`.
- Percentage: `CAST(SUM(CASE WHEN c THEN 1 ELSE 0 END) AS REAL) * 100 / COUNT(*)`. Denominator = WHERE-filtered set.
- Ratio: `CAST(SUM(CASE..) AS REAL) / SUM(CASE..)`.
- Per-month average: `CAST(COUNT(T1.ID) AS REAL) / 12`.

## Query shape
- Join:
  ```sql
  FROM Patient AS T1 INNER JOIN Laboratory AS T2 ON T1.ID = T2.ID
  ```
  Add `INNER JOIN Examination AS T3 ON T3.ID = T1.ID` only for exam fields.
- Lab values and Laboratory.Date are used even if the question says "examination". Examination only for Thrombosis, Symptoms, aCL*, ANA, KCT, RVVT, LAC, `Examination Date`.
- Counts:
  - refs often use plain `COUNT(T1.ID)` over joined lab rows;
  - `COUNT(DISTINCT T1.ID)` when "distinct patients" is implied;
  - single-table Patient counts need no DISTINCT.
- Patient lists (ID, SEX, Birthday): `SELECT DISTINCT`. Return only requested columns, in order.
- Top-1: `ORDER BY x DESC LIMIT 1`, no ties. "Highest within normal" = `WHERE TG < 200 ORDER BY TG DESC LIMIT 1`.
- Most common diagnosis: `GROUP BY T1.Diagnosis ORDER BY COUNT(T1.Diagnosis) DESC LIMIT 1`.
- NULL dates: add `` `First Date` IS NOT NULL `` when sorting by it (251 NULL; Description 216 NULL).
- Label output: `CASE WHEN ALB >= 3.5 AND ALB <= 5.5 THEN 'normal' ELSE 'abnormal' END`.
