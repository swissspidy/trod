# Toxicology DB notes

## Schema (4 tables)
- molecule(molecule_id PK 'TR000'..'TR501', label) — 343 rows. label '+' = carcinogenic (152), '-' = non-carcinogenic (191).
- atom(atom_id PK 'TR001_10', molecule_id, element) — 12333 rows. atom_id = molecule_id + '_' + atom number (number NOT zero-padded: 'TR001_1', 'TR001_10').
- bond(bond_id PK 'TR001_1_7', molecule_id, bond_type) — 12379 rows. bond_type: '-' single (10528), '=' double (1844), '#' triple (6), one NULL. Evidence sometimes writes ' = ' with spaces; real value is '=' (no spaces).
- connected(atom_id, atom_id2, bond_id) — SYMMETRIC: every bond stored twice (A,B) and (B,A); 24758 rows = 2 x 12379 bonds. So `connected JOIN atom ON atom.atom_id = connected.atom_id WHERE bond_id='X'` returns both atoms of the bond (2 rows). COUNT(bond_id) on connected per atom = that atom's degree.
- element = lowercase symbol: c h o n s cl br f i p na sn pb te ca b cu k si y zn (sulphur='s', tin='sn', lead='pb').
- Every molecule has atoms and bonds; every bond is in connected.

## Join patterns used by reference SQL
- molecule label for atoms: atom T1 JOIN molecule T2 ON T1.molecule_id=T2.molecule_id.
- "molecule with X bond + element Y": references usually join atom and bond on molecule_id (molecule-level, NOT atom-in-that-bond): `FROM atom T1 JOIN bond T2 ON T1.molecule_id=T2.molecule_id WHERE T2.bond_type='=' AND T1.element='o'`. Even "atom ID of double bonded carbon in TRxxx" joined atom-bond on molecule_id (no DISTINCT -> duplicates per bond kept!).
- Elements/atoms OF a specific bond: `connected T2 JOIN atom T1 ON T1.atom_id=T2.atom_id WHERE T2.bond_id='...'`.
- Bond type of atoms (atom-level bond): atom -> connected (atom_id) -> bond (bond_id).
- Molecule of a bond: bond.molecule_id directly (or SUBSTR(bond_id,1,5)).
- Atom number filters: references used `SUBSTR(atom_id,-2) = '19'` / `SUBSTR(T1.atom_id,-2) BETWEEN '21' AND '25'`.
- Molecule ranges: `molecule_id BETWEEN 'TR010' AND 'TR050'` (string compare works, ids are zero-padded 3 digits).

## Output conventions
- Lists of molecules/elements/bonds from joins: usually `SELECT DISTINCT ...`. But a single-entity lookup through a 1:N join is often without DISTINCT (e.g. elements of a bond via connected -> 2 rows). Simple single-table lookups (atom_ids of a molecule) have no DISTINCT.
- Counting molecules: `COUNT(DISTINCT T.molecule_id)`; counting atoms/bonds from their own table: `COUNT(atom_id)` / `COUNT(bond_id)`.
- Return only the asked columns; "is X carcinogenic" -> `SELECT label FROM molecule WHERE molecule_id=...`. "and tell if carcinogenic" -> include label column.
- Top-N alphabetical: `ORDER BY id LIMIT N`. "most" -> `GROUP BY ... ORDER BY COUNT(...) DESC LIMIT 1`, often wrapped so only the id column is returned: `SELECT T.molecule_id FROM (SELECT ..., COUNT(..) ... LIMIT 1) T`.
- Percent: `CAST(COUNT(CASE WHEN cond THEN T.id ELSE NULL END) AS REAL) * 100 / COUNT(T.id)`; wrap in ROUND(...,k) only when question asks k decimals. Ratio (not percent): same without *100.
- Percent of bonds: denominator = bonds in bond table (filtered by molecule if asked). Percent of atoms: atom table.
- Difference of counts: `COUNT(CASE WHEN label='+' THEN molecule_id END) - COUNT(CASE WHEN label='-' THEN molecule_id END)`.
- Two counts in one row: `COUNT(DISTINCT CASE WHEN element='i' THEN atom_id END), COUNT(DISTINCT CASE WHEN element='s' THEN atom_id END)`.
- "Count among these how many carcinogenic": `COUNT(DISTINCT T2.molecule_id), SUM(CASE WHEN T2.label='+' THEN 1 ELSE 0 END)` (SUM is over joined rows, not distinct — reference style).
- Average per molecule: `SELECT AVG(cnt) FROM (SELECT molecule_id, COUNT(...) cnt ... GROUP BY molecule_id)`.
- "more than N atoms": GROUP BY molecule_id HAVING COUNT(atom_id) > N.
- Negations ("without sulphur", "not double bond") were written naively as `element <> 's' AND bond_type <> '='` on joined rows, not NOT EXISTS.
