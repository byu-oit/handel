.. _dynamodb:

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
   * - type
     - string
     - Yes
     - 
     - This must always be *dynamodb* for this service type.
   * - partition_key
     - :ref:`dynamodb-partition-key`
     - Yes
     - 
     - The ParitionKey element details how you want your partition key specified.
   * - sort_key
     - :ref:`dynamodb-sort-key`
     - No
     - None
     - The SortKey element details how you want your sort key specified. Unlike partition_key, sort_key is not required.
   * - provisioned_throughput
     - :ref:`dynamodb-provisioned-throughput`
     - No
     - 5 for read and write
     - The ProvisionedThroughput element details how much provisioned IOPS you want on your table for reads and writes.
   * - local_indexes
     - :ref:`dynamodb-local-indexes`
     - No
     - 
     - You can configure `local secondary indexes <http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/LSI.html>`_ for fast queries on a different sort key within the same partition key.
   * - global_indexes
     - :ref:`dynamodb-global-indexes`
     - No
     -
     - You can configure `global secondary indexes <http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html>`_ for fast queries on other partition and sort keys in addition to the ones on your table.
   * - tags
     - :ref:`dynamodb-tags`
     - No
     - 
     - Any tags you want to apply to your Dynamo Table

.. _dynamodb-partition-key:

PartitionKey
~~~~~~~~~~~~
The PartitionKey element tells how to configure your partition key in DynamoDB. It has the following schema:

.. code-block:: yaml
    
    partition_key:
      name: <key_name> 
      type: <String|Number>

.. _dynamodb-sort-key:

SortKey
~~~~~~~
The SortKey element tells how to configure your sort key in DynamoDB. It has the following schema:

.. code-block:: yaml

    sort_key:
      name: <key_name> 
      type: <String|Number>

.. _dynamodb-provisioned-throughput:

ProvisionedThroughput
~~~~~~~~~~~~~~~~~~~~~
The ProvisionedThroughput element tells many IOPS to provision for your table for reads and writes. It has the following schema:

.. code-block:: yaml

    provisioned_throughput:
      read_capacity_units: <number>
      write_capacity_units: <number>

.. _dynamodb-local-indexes:

LocalIndexes
~~~~~~~~~~~~
The LocalIndexes element allows you to configure local secondary indexes on your table for alternate query methods. It has the following schema:

.. code-block:: yaml

    local_indexes:
    - name: <string> # Required
      sort_key: # Required
        name: <string>
        type: <String|Number>
      attributes_to_copy: # Required
      - <string>

.. _dynamodb-global-indexes:

GlobalIndexes
~~~~~~~~~~~~~
The GlobalIndexes element allows you to configure global secondary indexes on your table for alternate query methods. It allows you to specify a different partition key than the main table. It has the following schema:

.. code-block:: yaml

    global_indexes:
    - name: <string> # Required
      partition_key: # Required
        name: <string>
        type: <String|Number>
      sort_key: # Optional
        name: <string>
        type: <String|Number>
      attributes_to_copy: # Required
      - <string>
      provisioned_throughput: # Optional
        read_capacity_units: <number> # Default: 1
        write_capacity_units: <number> # Default: 1

.. WARNING::

    Be aware that using Global Secondary Indexes can greatly increase your cost. When you use global indexes, you are effectively creating a new table. This will increase your cost by the amount required for storage and allocated IOPS for the global index.

.. _dynamodb-tags:

Tags
~~~~
The Tags element is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>

.. NOTE::

    Handel automatically applies some tags for you. See :ref:`tagging-default-tags` for information about these tags.

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
          tags:
            name: my-dynamodb-tag

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

The <ENV_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See :ref:`environment-variable-prefix` for information about the structure of this prefix.

Events produced by this service
-------------------------------
The DynamoDB service does not currently produce events for other Handel services to consume. Support for events to services such as Lambda is planned to be added in the future.

Events consumed by this service
-------------------------------
The DynamoDB service does not consume events from other Handel services.