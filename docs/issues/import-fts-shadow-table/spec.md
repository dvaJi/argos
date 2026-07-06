# Issue: FTS5 Shadow Table Error During Incremental Import

## Symptom
Incremental (increment) import of a backup throws an error and rolls back:

```text
Failed to import database: Failed to import table argos_search_documents_fts_config:
table argos_search_documents_fts_config may not be modified
```

This is triggered when cloud sync's "pull latest from cloud" reuses `importFromSync`, and the local "import data" path reproduces the same issue.

## Root Cause
`DataImporter.getTablesInOrder()` (`src/main/presenter/sqlitePresenter/importData.ts`) queries tables with
`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`, which does not exclude
the FTS5 virtual table `argos_search_documents_fts` or its shadow tables
`_data/_idx/_docsize/_config`. Running a plain `INSERT` against a shadow table is rejected by SQLite ("may not be modified").

Key gotcha: FTS5 shadow tables in `sqlite_master` **carry a real `CREATE TABLE` SQL statement (not NULL)**, so
they cannot be identified via `sql IS NULL`. They must be excluded by the virtual-table-name prefix.

## Fix
First fetch all virtual tables (`sql LIKE 'CREATE VIRTUAL TABLE%'`), then exclude tables whose name equals
the virtual table name or starts with `<virtual-table-name>_`. FTS5 uses the external content table pattern
(`content='argos_search_documents'`) plus triggers, so importing rows into the content table
`argos_search_documents` lets the triggers maintain the FTS index automatically; there is no need to write the FTS table directly.

## Impact
- Only the incremental import path (`DataImporter`); overwrite import copies the whole database file and is unaffected.
- After the fix, import no longer touches FTS shadow tables; the search index is rebuilt by triggers.

## Verification
- Incremental import of backups containing `argos_search_documents_fts*` tables succeeds without errors.
- After import, searching the imported documents matches results (the FTS index is populated by triggers).
