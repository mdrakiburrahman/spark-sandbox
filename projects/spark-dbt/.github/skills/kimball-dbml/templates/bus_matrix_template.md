# Bus Matrix — `<project-name>`

> Companion to `erd/<name>.dbml`. Documents the fact ↔ dimension grid, fact grains, and role-playing dimensions.

---

## Fact ↔ Dimension Grid

At each intersection, describe **what the dimension means for that fact** (e.g. "per customer", "per snapshot date", "via subscription" for snowflaked dims, `—` if not present).

| Dimension              |  `fct_<event_a>`  |  `fct_<event_b>`  |   `fct_<event_c>`    |
| ---------------------- | :---------------: | :---------------: | :------------------: |
| **dim_date**           |     Per event     |  Daily snapshot   | Per event (×N roles) |
| **dim\_<conformed_a>** | Per <conformed_a> | Per <conformed_a> |          —           |
| **dim\_<conformed_b>** | Via <conformed_a> |         —         |  Per <conformed_b>   |
| **dim\_<local_a>**     |   Per <local_a>   |         —         |          —           |
| **dim\_<local_b>**     |         —         |   Per <local_b>   |    Per <local_b>     |

---

## Fact Table Grains

> The grain is part of each fact's contract. Document it precisely and never change it without renaming the fact.

| Fact Table      | Archetype             | Grain                                                  |
| --------------- | --------------------- | ------------------------------------------------------ |
| `fct_<event_a>` | Transaction           | One row per `<event_a>` per `<entity>`                 |
| `fct_<event_b>` | Periodic snapshot     | One row per `<entity>` per day                         |
| `fct_<event_c>` | Accumulating snapshot | One row per `<process_instance>` (updated as it moves) |
| `fct_<event_d>` | Factless              | One row per `<membership_event>` (count rows only)     |

---

## Role-Playing Dimensions

When the same dimension joins to the same fact multiple times under different semantics, alias the FK column:

| Fact Table      | Dimension  | Role-playing keys                                             |
| --------------- | ---------- | ------------------------------------------------------------- |
| `fct_<event_c>` | `dim_date` | `<role_1>_date_key`, `<role_2>_date_key`, `<role_3>_date_key` |
| `fct_<event_x>` | `dim_<a>`  | `previous_<a>_key`, `current_<a>_key`                         |

---

## Conformed Dimensions

> Dimensions reused across multiple facts. Maintain a single canonical surrogate-key space.

| Dimension           | Appears in facts                                  |
| ------------------- | ------------------------------------------------- |
| `dim_date`          | `fct_<event_a>`, `fct_<event_b>`, `fct_<event_c>` |
| `dim_<conformed_a>` | `fct_<event_a>`, `fct_<event_b>`                  |
| `dim_<conformed_b>` | `fct_<event_a>`, `fct_<event_c>`                  |

---

## Measure Additivity Per Fact

| Fact            | Measure              | Additivity                              | Query pattern                                        |
| --------------- | -------------------- | --------------------------------------- | ---------------------------------------------------- |
| `fct_<event_a>` | `<measure_1>`        | ✅ Fully additive                       | `SUM(<measure_1>)` across any combination of dims    |
| `fct_<event_a>` | `<distinct_entity>`  | ⚠️ Semi-additive (use `COUNT DISTINCT`) | Filter to a single date if periodic snapshot         |
| `fct_<event_b>` | `<balance_or_state>` | ❌ Non-additive across time             | Filter to `date_key = (SELECT MAX(date_key) FROM …)` |
