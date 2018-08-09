.. _elasticsearch:

Elasticsearch
=============
This page contains information about using the Elasticsearch service in Handel. This service provides an Amazon ElasticSearch cluster.

.. WARNING::

    This provisioner is new and should be considered in beta. It is subject to breaking changes until this beta label is removed.

Service Limitations
-------------------
No Zone Awareness Support
~~~~~~~~~~~~~~~~~~~~~~~~~
Currently Elasticsearch clusters are only deployed in a single Availability Zone (AZ), and there is no support for the two-AZ zone awareness support.

No Kibana Support
~~~~~~~~~~~~~~~~~
While Kibana is deployed with the Elasticsearch cluster, there is currently no way for you to access it since the cluster does not have wide-open security permissions and Cognito authentication isn't supported.

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
   * - ebs
     - :ref:`elasticsearch-ebs`
     - No
     - 
     - This section is required if you specify an instance type that uses EBS storage instead of the instance store.
   * - master_node
     - :ref:`elasticsearch-master-node`
     - No
     - 
     - If you specify this section, you will configure a master node cluster to handle cluster management operations.
   * - tags
     - :ref:`tagging-resources`
     - No
     - 
     - Any tags you wish to apply to this Elasticsearch cluster.

.. _elasticsearch-ebs:

EBS
~~~
The *ebs* section is defined by the following schema:

.. code-block:: yaml

    ebs:
      size_gb: <number> # Required. The size of the EBS disk in GB
      provisioned_iops: <number> # Optional. The number of provisioned IOPS you want to dedicate to the EBS disk.

.. IMPORTANT::

  Each instance type has different values for the allowed values of the *size_gb* parameter. See `EBS Volume Size Limits <https://docs.aws.amazon.com/elasticsearch-service/latest/developerguide/aes-limits.html#ebsresource>`_ for the allowed values for each instance type


.. _elasticsearch-master-node:

MasterNode
~~~~~~~~~~
The *master_node* section is defined by the following schema:

.. code-block:: yaml

    master_node:
      instance_type: <string> # Required
      instance_count: <number> # Required

.. NOTE::

    Amazon recommends using master nodes to increase cluster stability. See `Dedicated Master Nodes <https://docs.aws.amazon.com/elasticsearch-service/latest/developerguide/es-managedomains-dedicatedmasternodes.html>`_ for their recommendations.

IAM Authentication
------------------
Your ElasticSearch cluster requires IAM authentication to your Elasticsearch endpoint. This is done using AWS' `signature version 4 signing process <https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html>`_. Each HTTP request to Elasticsearch must include the signature headers required by AWS to validate your IAM role identity.

See AWS' `Programmatic Indexing <https://docs.aws.amazon.com/elasticsearch-service/latest/developerguide/es-indexing-programmatic.html>`_ page for information about how perform this authentication in various languages.

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
          ebs:
            size_gb: 10

Depending on this service
-------------------------
The Elasticsearch service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_DOMAIN_ENDPOINT
     - The address that you should use to communicate with the cluster.
   * - <SERVICE_NAME>_DOMAIN_NAME
     - The name of your Elasticsearch domain.

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The Elasticsearch service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Elasticsearch service does not consume events from other Handel services.
