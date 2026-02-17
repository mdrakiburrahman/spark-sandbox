package me.rakirahman.metastore

/** Trait representing operations for interacting with a SQL metastore.
  */
trait MetastoreOperations
    extends DatabaseOperations
    with TableOperations
    with SchemaOperations
    with SchemaConversionOperations
    with PartitionOperations
    with CatalogOperations
    with DeltaTimeTravelOperations
    with ComparisonOperations
