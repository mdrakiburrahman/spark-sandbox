package me.rakirahman.etl.schema.openlineage.v1

import me.rakirahman.feeds.schema.{SchemaSampler, SingleObjectSchema}

import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.types.StructType

/** Enumeration defining the different types of OpenLineage event types.
  *
  * >>> Source: https://openlineage.io/docs/spec/run-cycle
  */
object OpenLineageEventTypes extends Enumeration {
  type EventTypes = Value
  val START = Value("START")
  val RUNNING = Value("RUNNING")
  val COMPLETE = Value("COMPLETE")
  val FAIL = Value("FAIL")
  val OTHER = Value("OTHER")
}

/** Constants related to OpenLineage processing.
  */
object OpenLineageConstantGenerators {

  /** Returns the Spark Schema for the OpenLineage RunEvent, inferred from a representative JSON sample.
    *
    * @param spark
    *   The [[SparkSession]] for schema inference.
    * @return
    *   The [[StructType]].
    */
  def getSchema(spark: SparkSession): StructType = {
    import spark.implicits._
    spark.read
      .json(Seq(new OpenLineageRunEventSchema(spark).Sample.head).toDS())
      .schema
  }

  /** Returns a JSON sample for the OpenLineage RunEvent.
    *
    * @param spark
    *   The [[SparkSession]].
    * @return
    *   The sample JSON string.
    */
  def getSchemaSample(spark: SparkSession): String =
    new OpenLineageRunEventSchema(spark).Sample.head
}

// @formatter:off
/** OpenLineage RunEvent schema, inferred from a representative sample payload.
  *
  * >>> Spec: https://openlineage.io/spec/2-0-2/OpenLineage.json
  */
class OpenLineageRunEventSchema(spark: SparkSession)
    extends SingleObjectSchema
    with SchemaSampler {

  /** Sample data - a representative OpenLineage RunEvent with all facets populated.
    */
  // @formatter:off
  val Sample = Seq(
    """{
      |   "eventTime":"2026-02-21T20:25:16.567Z",
      |   "producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |   "schemaURL":"https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunEvent",
      |   "eventType":"START",
      |   "run":{
      |      "runId":"019c81e0-c219-7b88-81b2-736938169857",
      |      "facets":{
      |         "parent":{
      |            "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |            "_schemaURL":"https://openlineage.io/spec/facets/1-0-1/ParentRunFacet.json#/$defs/ParentRunFacet",
      |            "run":{
      |               "runId":"019c81e0-94d6-7e6d-bc88-cd0f997dc298"
      |            },
      |            "job":{
      |               "namespace":"default",
      |               "name":"spark_sql_172_17_0_2"
      |            }
      |         },
      |         "spark_properties":{
      |            "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |            "_schemaURL":"https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunFacet",
      |            "properties":{
      |               "spark.master":"local[*]",
      |               "spark.app.name":"SparkSQL::172.17.0.2"
      |            }
      |         },
      |         "processing_engine":{
      |            "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |            "_schemaURL":"https://openlineage.io/spec/facets/1-1-1/ProcessingEngineRunFacet.json#/$defs/ProcessingEngineRunFacet",
      |            "version":"3.5.1",
      |            "name":"spark",
      |            "openlineageAdapterVersion":"1.26.0"
      |         },
      |         "environment-properties":{
      |            "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |            "_schemaURL":"https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunFacet",
      |            "environment-properties":{}
      |         },
      |         "spark_applicationDetails":{
      |            "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |            "_schemaURL":"https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunFacet",
      |            "master":"local[*]",
      |            "appName":"Spark shell",
      |            "applicationId":"local-1771705208450",
      |            "deployMode":"client",
      |            "driverHost":"094d98b811da",
      |            "userName":"vscode",
      |            "uiWebUrl":"http://094d98b811da:4040"
      |         }
      |      }
      |   },
      |   "job":{
      |      "namespace":"default",
      |      "name":"spark_sql_172_17_0_2.collect_limit",
      |      "facets":{
      |         "jobType":{
      |            "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |            "_schemaURL":"https://openlineage.io/spec/facets/2-0-3/JobTypeJobFacet.json#/$defs/JobTypeJobFacet",
      |            "processingType":"BATCH",
      |            "integration":"SPARK",
      |            "jobType":"SQL_JOB"
      |         },
      |         "sql":{
      |            "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |            "_schemaURL":"https://openlineage.io/spec/facets/1-0-1/SQLJobFacet.json#/$defs/SQLJobFacet",
      |            "query":"SELECT request_body FROM data_ops_inventory_db.http_dumper_plugin LIMIT 1"
      |         }
      |      }
      |   },
      |   "inputs":[
      |      {
      |         "namespace":"file",
      |         "name":"/workspaces/spark-sandbox/warehouse/data_ops_inventory_db.db/http_dumper_plugin",
      |         "facets":{
      |            "dataSource":{
      |               "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |               "_schemaURL":"https://openlineage.io/spec/facets/1-0-1/DatasourceDatasetFacet.json#/$defs/DatasourceDatasetFacet",
      |               "name":"file",
      |               "uri":"file"
      |            },
      |            "schema":{
      |               "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |               "_schemaURL":"https://openlineage.io/spec/facets/1-1-1/SchemaDatasetFacet.json#/$defs/SchemaDatasetFacet",
      |               "fields":[
      |                  {
      |                     "name":"result_timestamp",
      |                     "type":"timestamp"
      |                  },
      |                  {
      |                     "name":"result_timestamp_long",
      |                     "type":"long"
      |                  },
      |                  {
      |                     "name":"event_year_date",
      |                     "type":"string"
      |                  }
      |               ]
      |            },
      |            "symlinks":{
      |               "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |               "_schemaURL":"https://openlineage.io/spec/facets/1-0-1/SymlinksDatasetFacet.json#/$defs/SymlinksDatasetFacet",
      |               "identifiers":[
      |                  {
      |                     "namespace":"file:/workspaces/spark-sandbox/warehouse",
      |                     "name":"data_ops_inventory_db.http_dumper_plugin",
      |                     "type":"TABLE"
      |                  }
      |               ]
      |            }
      |         },
      |         "inputFacets":{}
      |      }
      |   ],
      |   "outputs":[
      |      {
      |         "namespace":"file",
      |         "name":"/workspaces/spark-sandbox/warehouse/data_ops_inventory_db.db/output_table",
      |         "facets":{
      |            "dataSource":{
      |               "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |               "_schemaURL":"https://openlineage.io/spec/facets/1-0-1/DatasourceDatasetFacet.json#/$defs/DatasourceDatasetFacet",
      |               "name":"file",
      |               "uri":"file"
      |            },
      |            "version":{
      |               "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |               "_schemaURL":"https://openlineage.io/spec/facets/1-0-1/DatasetVersionDatasetFacet.json#/$defs/DatasetVersionDatasetFacet",
      |               "datasetVersion":"1"
      |            },
      |            "storage":{
      |               "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |               "_schemaURL":"https://openlineage.io/spec/facets/1-0-1/StorageDatasetFacet.json#/$defs/StorageDatasetFacet",
      |               "storageLayer":"delta",
      |               "fileFormat":"parquet"
      |            },
      |            "columnLineage":{
      |               "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |               "_schemaURL":"https://openlineage.io/spec/facets/1-2-0/ColumnLineageDatasetFacet.json#/$defs/ColumnLineageDatasetFacet",
      |               "fields":{
      |                  "event_year_date":{
      |                     "inputFields":[
      |                        {
      |                           "namespace":"file",
      |                           "name":"/workspaces/spark-sandbox/warehouse/data_ops_inventory_db.db/http_dumper_plugin",
      |                           "field":"event_year_date",
      |                           "transformations":[
      |                              {
      |                                 "type":"DIRECT",
      |                                 "subtype":"IDENTITY",
      |                                 "description":"",
      |                                 "masking":false
      |                              }
      |                           ]
      |                        }
      |                     ]
      |                  }
      |               }
      |            },
      |            "schema":{
      |               "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |               "_schemaURL":"https://openlineage.io/spec/facets/1-1-1/SchemaDatasetFacet.json#/$defs/SchemaDatasetFacet",
      |               "fields":[
      |                  {
      |                     "name":"result_timestamp",
      |                     "type":"timestamp"
      |                  },
      |                  {
      |                     "name":"event_year_date",
      |                     "type":"string"
      |                  }
      |               ]
      |            },
      |            "symlinks":{
      |               "_producer":"https://github.com/OpenLineage/OpenLineage/tree/1.26.0/integration/spark",
      |               "_schemaURL":"https://openlineage.io/spec/facets/1-0-1/SymlinksDatasetFacet.json#/$defs/SymlinksDatasetFacet",
      |               "identifiers":[
      |                  {
      |                     "namespace":"file:/workspaces/spark-sandbox/warehouse",
      |                     "name":"data_ops_inventory_db.output_table",
      |                     "type":"TABLE"
      |                  }
      |               ]
      |            }
      |         },
      |         "outputFacets":{}
      |      }
      |   ]
      |}""".stripMargin
  )
  // @formatter:on

  /** @inheritdoc
    */
  override val schema: StructType = {
    import spark.implicits._
    spark.read
      .json(Sample.toDS())
      .schema
  }
}
// @formatter:on
