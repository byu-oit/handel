DynamoDB
========
This page contains information about using DynamoDB service supported in Handel. This service provisions a DynamoDB table for use by other AWS services.

Service Limitations
-------------------
The following features are currently not supported:

* Local secondary indexes
* Global secondary indexes
* DynamoDB streams

Parameters
----------

.. list-table::
   :header-rows: 1

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - partition_key
     - PartitionKey
     - Yes
     - 
     - The ParitionKey element details how you want your partition key specified.
   * - sort_key
     - SortKey
     - No
     - None
     - The SortKey element details how you want your sort key specified. Unlike partition_key, sort_key is not required.
   * - provisioned_throughput
     - ProvisionedThroughput
     - No
     - 5 for read and write
     - The ProvisionedThroughput element details how much provisioned IOPS you want on your table for reads and writes.

PartitionKey element
~~~~~~~~~~~~~~~~~~~~
The PartitionKey element tells how to configure your partition key in DynamoDB. It has the following schema:

.. code-block:: yaml
    
    partition_key:
      name: <key_name> 
      type: <String|Number>

SortKey element
~~~~~~~~~~~~~~~
The SortKey element tells how to configure your sort key in DynamoDB. It has the following schema:

.. code-block:: yaml

    sort_key:
      name: <key_name> 
      type: <String|Number>

ProvisionedThroughput element
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
The ProvisionedThroughput element tells many IOPS to provision for your table for reads and writes. It has the following schema:

.. code-block:: yaml

    sort_key:
    provisioned_throughput:
      read_capacity_units: <Number>
      write_capacity_units: <Number>

Example Handel File
-------------------
.. code-block:: yaml

    version: 1

    name: my-ecs-app

    environments:
      dev:
        webapp:
          type: dynamodb
          partition_key: # Required, NOT updateable
            name: MyPartionKey
            type: String
          sort_key:
            name: MySortKey
            type: Number
          provisioned_throughput:
            read_capcity_units: 6
            write_capacity_units: 6

Depending on this service
-------------------------
The DynamoDB service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <ENV_PREFIX>_TABLE_NAME
     - The name of the created DynamoDB table
   * - <ENV_PREFIX>_TABLE_ARN
     - The ARN of the created DynamoDB table

The <URL_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See the [Consuming Service Dependencies](https://github.com/byu-oit-appdev/handel/wiki/Consuming-Service-Dependencies#environment-variable-prefix) page for information about the structure of this prefix.

Events produced by this service
-------------------------------
The DynamoDB service does not currently produce events for other Handel services to consume. Support for events to services such as Lambda is planned to be added in the future.

Events consumed by this service
-------------------------------
The DynamoDB service does not consume events from other Handel services.