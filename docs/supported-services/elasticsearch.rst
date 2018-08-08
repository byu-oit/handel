.. _elasticsearch:

Elasticsearch
=============
This page contains information about using the Elasticsearch service in Handel. This service provides an Amazon ElasticSearch cluster.

.. WARNING::

    This provisioner is new and should be considered in beta. It is subject to breaking changes until this beta label is removed.

Service Limitations
-------------------
TODO

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
     - This must always be *elasticsearch* for this service type.
   * - version
     - number
     - Yes
     -
     - The version number of ElasticSearch to use. See `Supported Elasticsearch Versions <https://docs.aws.amazon.com/elasticsearch-service/latest/developerguide/what-is-amazon-elasticsearch-service.html#aes-choosing-version>`_ for more details
   * - instance_type
     - string
     - No
     - t2.small.elasticsearch
     - The size of database instance to run. See `Elasticsearch Pricing <https://aws.amazon.com/elasticsearch-service/pricing/>`_ for the allowed instance types.
   * - instance_count
     - number
     - No
     - 1
     - The number of instances to run in your cluster.
   * - tags
     - :ref:`tagging-resources`
     - No
     - 
     - Any tags you wish to apply to this Elasticsearch cluster.


Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: elasticsearch-test

    environments:
      dev:
        search:
          type: elasticsearch
          version: 6.2
          instance_type: t2.small.elasticsearch
          instance_count: 1
          tags:
            some: tag

Depending on this service
-------------------------
The Elasticsearch service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_DOMAIN_ENDPOINT
     - The address that you should use to communicate with the cluster.

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The Elasticsearch service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Elasticsearch service does not consume events from other Handel services.
