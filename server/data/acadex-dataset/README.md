# Acadex synthetic dataset

These 12 CSV tables come from the supplied `acadex_mock_data.zip`. Its README identifies the data as synthetic (seed 42), with 300 student profiles, 14 classes, and 14 teachers. No production school records are included.

`npm run import:dataset` loads these CSV files into isolated MongoDB collections named `dataset_<table>`. It does not write to Acadex's normal `students`, `classes`, `teachers`, or other school-record collections. The importer is idempotent and requires `ALLOW_DATASET_IMPORT=yes` when `NODE_ENV=production`.

The app's admin-only Dataset insights page exposes aggregates and selected master-student indicators. It intentionally does not display the synthetic health time-series table.
