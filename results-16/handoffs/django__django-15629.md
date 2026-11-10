# HANDOFF: db_collation not propagated to FKs (Django ticket #33413)

## Problem
When a PK's `db_collation` changes, the columns that point to it (FKs, O2Os, and the FK
columns in M2M auto-created through tables) are not altered or created with that collation.
On MySQL this breaks the FK constraint. Root causes:

1. `ForeignKey.db_parameters()` (`django/db/models/fields/related.py` ~line 1182) returns only
   `type`/`check`, so FK columns never get a collation. `column_sql`/`_iter_column_sql` in
   `django/db/backends/base/schema.py:282` already reads `field_db_params.get("collation")`,
   so once the FK reports it, CREATE TABLE and the SQLite remake work.
2. `BaseDatabaseSchemaEditor._alter_field` (`django/db/backends/base/schema.py`):
   - `drop_foreign_keys` (~line 826) only fires on `old_type != new_type`, not on a collation change.
   - The `rels_to_update` loop (~line 1038) always calls `_alter_column_type_sql`, which never adds COLLATE.
3. SQLite `_alter_field` (`django/db/backends/sqlite3/schema.py` ~line 458) rebuilds related
   tables only when `old_type != new_type`.
4. MySQL `MODIFY` with no NULL/NOT NULL makes the column nullable. `_alter_column_type_sql`
   already adds the null status, but `_alter_column_collation_sql` does not. This is needed
   so the FK column keeps NOT NULL (see the issue's expected SQL).

## Reproduction (already added; fails now, must pass after the fix)
- New test `OperationTests.test_alter_field_pk_fk_db_collation` in `tests/migrations/test_operations.py`
- New helpers `_get_column_collation` / `assertColumnCollation` in `tests/migrations/test_base.py`

Command:
```
python tests/runtests.py migrations.test_operations.OperationTests.test_alter_field_pk_fk_db_collation
```
It currently fails with `AssertionError: None != 'nocase'` on rider.pony_id.

## Changes to make

### 1. `django/db/models/fields/related.py`, `ForeignKey.db_parameters`
```python
    def db_parameters(self, connection):
        target_db_parameters = self.target_field.db_parameters(connection)
        return {
            "type": self.db_type(connection),
            "check": self.db_check(connection),
            "collation": target_db_parameters.get("collation"),
        }
```
(Leave `ManyToManyField.db_parameters` as it is.)

### 2. `django/db/backends/base/schema.py`, `_alter_field`
a) Before the `drop_foreign_keys = (...)` block (~line 826), add:
```python
        old_collation = old_db_params.get("collation")
        new_collation = new_db_params.get("collation")
```
and change the condition's tail from `and old_type != new_type` to
```python
            and ((old_type != new_type) or (old_collation != new_collation))
```
The existing `# Collation change?` block further down sets `old_collation`/`new_collation` again.
You can keep it or remove the duplicate assignments; the behaviour is the same.

b) In the `for old_rel, new_rel in rels_to_update:` loop (~line 1038), replace the fragment computation with:
```python
            rel_db_params = new_rel.field.db_parameters(connection=self.connection)
            rel_type = rel_db_params["type"]
            rel_collation = rel_db_params.get("collation")
            old_rel_db_params = old_rel.field.db_parameters(connection=self.connection)
            old_rel_collation = old_rel_db_params.get("collation")
            if old_rel_collation != rel_collation:
                # Collation change handles also a type change.
                fragment = self._alter_column_collation_sql(
                    new_rel.related_model,
                    new_rel.field,
                    rel_type,
                    rel_collation,
                )
                other_actions = []
            else:
                fragment, other_actions = self._alter_column_type_sql(
                    new_rel.related_model, old_rel.field, new_rel.field, rel_type
                )
```
Leave the following `self.execute(self.sql_alter_column % ...)` and `other_actions` loop as they are.

### 3. `django/db/backends/sqlite3/schema.py`, `_alter_field` (~line 458)
```python
        # Rebuild tables with FKs pointing to this field.
        old_collation = old_db_params.get("collation")
        new_collation = new_db_params.get("collation")
        if new_field.unique and (
            old_type != new_type or old_collation != new_collation
        ):
```

### 4. `django/db/backends/mysql/schema.py`: add next to `_alter_column_type_sql`
```python
    def _alter_column_collation_sql(self, model, new_field, new_type, new_collation):
        new_type = self._set_field_new_type_null_status(new_field, new_type)
        return super()._alter_column_collation_sql(
            model, new_field, new_type, new_collation
        )
```
(Oracle already overrides `_alter_column_collation_sql`. It calls super, so nothing needs to change there.)

## Things to check
- `old_rel.field.target_field` resolves to the old PK (it comes from the from_state model), so its collation is the old collation.
- Run these as regression checks:
  `python tests/runtests.py migrations schema model_fields invalid_models_tests inspectdb backends`
  (SQLite is the only DB here. MySQL, Oracle and Postgres code paths can't be run locally.)
- Optionally add `"collation"` assertions for FKs to `model_fields` tests. One example:
  `ForeignKey(Target with CharField(db_collation="x", pk)).db_parameters(connection)["collation"] == "x"`.
  The hidden tests may check this.
- Optionally add a release note in `docs/releases/4.1.txt` (or the current version's notes).
