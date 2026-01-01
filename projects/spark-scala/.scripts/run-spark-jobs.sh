#!/bin/bash
#
#
#       Script to spark submit the various jobs in the spark-orchestrator
#       project. The execution sequence is equivalent to the pipeline jobs that
#       get run in Synapse, for local reproduction.
#
#       Tip: Comment/uncomment locally to execute the desired job.
#
#            You can use VSCode find and replace (CTRL + F) to:
#
#            ----------------------------------------
#            FIND:     /opt/spark/bin/spark-submit
#            REPLACE:  #/opt/spark/bin/spark-submit
#            ----------------------------------------
#
#            Then manually uncomment the jobs you want to specifically run.
#
#       Ensure line ending is LF, and not CRLF.
#
# ---------------------------------------------------------------------------------------
#