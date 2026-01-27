## Dimensional modelling dbt project: `adventureworks`

- [Website](https://docs.getdbt.com/blog/kimball-dimensional-model)
- [Code](https://github.com/mdrakiburrahman/dbt-dimensional-modelling)

## Introduction

Dimensional modelling is one of many data modelling techniques that are used by data practitioners to organize and present data for analytics. Other data modelling techniques include Data Vault (DV), Third Normal Form (3NF), and One Big Table (OBT) to name a few.

![Data Model](docs/img/data-modelling.png)
_Data modelling techniques on a normalization vs denormalization scale_

While the relevancy of dimensional modelling [has been debated by data practitioners](https://discourse.getdbt.com/t/is-kimball-dimensional-modeling-still-relevant-in-a-modern-data-warehouse/225/6), it is still one of the most widely adopted data modelling technique for analytics.

Despite its popularity, resources on how to create dimensional models using dbt remain scarce and lack detail. This tutorial aims to solve this by providing the definitive guide to dimensional modelling with dbt.

## Dimensional modelling

Dimensional modelling is a technique introduced by Ralph Kimball in 1996 with his book, [The Data Warehouse Toolkit](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/books/data-warehouse-dw-toolkit/).

The goal of dimensional modelling is to take raw data and transform it into Fact and Dimension tables that represent the business.

![](docs/img/3nf-to-dimensional-model.png)

_Raw 3NF data to dimensional model_

The benefits of dimensional modelling are:

- **Simpler data model for analytics**: Users of dimensional models do not need to perform complex joins when consuming a dimensional model for analytics. Performing joins between fact and dimension tables are made simple through the use of surrogate keys.
- [**Don’t repeat yourself**](https://docs.getdbt.com/terms/dry): Dimensions can be easily re-used with other fact tables to avoid duplication of effort and code logic. Reusable dimensions are referred to as conformed dimensions.
- **Faster data retrieval**: Analytical queries executed against a dimensional model are significantly faster than a 3NF model since data transformations like joins and aggregations have been already applied.
- **Close alignment with actual business processes**: Business processes and metrics are modelled and calculated as part of dimensional modelling. This helps ensure that the modelled data is easily usable.

Now that we understand the broad concepts and benefits of dimensional modelling, let’s get hands-on and create our first dimensional model using dbt.

[Next &raquo;](docs/part01-setup-dbt-project.md)

## Environment setup

```bash
az login

export GIT_ROOT=$(git rev-parse --show-toplevel)
cd "${GIT_ROOT}/projects/spark-dbt/dbt-adventureworks"

export DBT_PROFILES_DIR=$(pwd)
export DBT_DEBUG=false

dbt debug
```

## Run

Install deps:

```bash
dbt deps

# 22:47:51  Installing dbt-labs/dbt_utils
# 22:47:52    Installed from version 1.0.0
# 22:47:52    Updated version available: 1.3.3
```

Seed database (do not run in `local` mode since we mount from OneLake):

```bash
dbt seed
```

![Source Schema](docs/img/source-schema.png)

The Snowflake schema is as follows:

![Snowflake Schema](docs/img/snowflake-schema.png)

The STAR schema is as follows:

![STAR Schema](docs/img/star-schema.png)

And the DBT DAG:

![DBT DAG](docs/img/dbt-dag.png)

Here are the tables at this point:

```sql
spark.sql("SHOW TABLES IN dbt_adventureworks").show(truncate = false)
```

```text
+------------------+---------------------------+-----------+
|namespace         |tableName                  |isTemporary|
+------------------+---------------------------+-----------+
|dbt_adventureworks|address                    |false      |
|dbt_adventureworks|countryregion              |false      |
|dbt_adventureworks|creditcard                 |false      |
|dbt_adventureworks|customer                   |false      |
|dbt_adventureworks|date                       |false      |
|dbt_adventureworks|person                     |false      |
|dbt_adventureworks|product                    |false      |
|dbt_adventureworks|productcategory            |false      |
|dbt_adventureworks|productsubcategory         |false      |
|dbt_adventureworks|salesorderdetail           |false      |
|dbt_adventureworks|salesorderheader           |false      |
|dbt_adventureworks|salesorderheadersalesreason|false      |
|dbt_adventureworks|salesreason                |false      |
|dbt_adventureworks|stateprovince              |false      |
|dbt_adventureworks|store                      |false      |
+------------------+---------------------------+-----------+
```

Build the model:

```bash
dbt run
```

Test:

```bash
dbt test
```

Here are the tables at this point:

```sql
spark.sql("SHOW TABLES IN dbt_adventureworks").show(100, truncate = false)
```

```text
+------------------+---------------------------+-----------+
|namespace         |tableName                  |isTemporary|
+------------------+---------------------------+-----------+
|dbt_adventureworks|address                    |false      |
|dbt_adventureworks|countryregion              |false      |
|dbt_adventureworks|creditcard                 |false      |
|dbt_adventureworks|customer                   |false      |
|dbt_adventureworks|date                       |false      |
|dbt_adventureworks|dim_address                |false      |
|dbt_adventureworks|dim_credit_card            |false      |
|dbt_adventureworks|dim_customer               |false      |
|dbt_adventureworks|dim_date                   |false      |
|dbt_adventureworks|dim_order_status           |false      |
|dbt_adventureworks|dim_product                |false      |
|dbt_adventureworks|fct_sales                  |false      |
|dbt_adventureworks|obt_sales                  |false      |
|dbt_adventureworks|person                     |false      |
|dbt_adventureworks|product                    |false      |
|dbt_adventureworks|productcategory            |false      |
|dbt_adventureworks|productsubcategory         |false      |
|dbt_adventureworks|salesorderdetail           |false      |
|dbt_adventureworks|salesorderheader           |false      |
|dbt_adventureworks|salesorderheadersalesreason|false      |
|dbt_adventureworks|salesreason                |false      |
|dbt_adventureworks|stateprovince              |false      |
|dbt_adventureworks|store                      |false      |
+------------------+---------------------------+-----------+
```

And we can see the DBT DAG for `obt_sales`:

```bash
dbt docs generate
dbt docs serve --port 18081
```
