.. _deployment-logs:

Handel Deployment Logs
======================
For internal use as well as an audit trail, Handel writes some information regarding the deployment and deletion of a Handel environment to a DynamoDB table named: `handel-deployment-logs`.

Log Entry Structure
-------------------
After every deployment and every deletion for each environment, Handel will put an entry into the `handel-deployment-logs` DynamoDB table.

.. list-table::
    :header-rows: 1

    * - Field
      - Key
      - Type
      - Description
    * - AppName
      - Partition Key
      - String
      - The application name being deployed/deleted
    * - EnvAction
      - Sort Key
      - String
      - A combination of EnvironmentName, Lifecycle and timestamp
    * - Lifecycle
      -
      - String
      - "deploy" or "delete"
    * - EnvironmentName
      -
      - String
      - The environment that was deployed or deleted (i.e. "dev" or "prd")
    * - DeploymentStartTime
      -
      - Number
      - The timestamp in milliseconds (since the epoc) of when the deployment/deletion was initiated
    * - DeploymentEndTime
      -
      - Number
      - The timestamp in milliseconds (since the epoc) of when the deployment/deletion finished
    * - DeploymentStatus
      -
      - String
      - "success" or "failure"
    * - DeploymentMessage
      -
      - String
      - Success or failure message
    * - EnvironmentContents
      -
      - JSON Object
      - A JSON representation of the environment's Handel services that were deployed or deleted

Here's an example deployment entry:

.. code-block:: json

    {
        "AppName": "test-app",
        "EnvAction": "dev:deploy:1536357426736"
        "Lifecycle": "deploy",
        "EnvironmentName": "dev",
        "DeploymentStartTime": 1536357268101,
        "DeploymentEndTime": 1536357426736,
        "DeploymentStatus": "success",
        "DeploymentMessage": "Success",
        "EnvironmentContents": {
            "my-lambda": {
                "type": "lambda",
                "path_to_code": ".",
                "handler": "index.handler",
                "runtime": "nodejs6.10"
                "dependencies": [
                    "my-db"
                ]
            },
            "my-db": {
                "type": "mysql",
                "database_name": "test_db",
                "mysql_version": "5.6.27"
            }
        }
    }