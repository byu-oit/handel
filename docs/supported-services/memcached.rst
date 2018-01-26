.. _memcached:

Memcached (ElastiCache)
=======================
This page contains information about using the Memcached service in Handel. This service provides a Memcached cluster via the ElastiCache service.

Service Limitations
-------------------

No Scheduled Maintenance Window Configuration
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This service currently doesn't allow you to change the maintenance window for your Memcached cluster.

No Snapshot Window Configuration
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This service currently doesn't allow you to change the snapshot window for your Memcached cluster.

No Restoration From Snapshot
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This service currently doesn't allow you to launch a cluster from a previous cluster snapshot.

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
     - This must always be *memcached* for this service type.
   * - instance_type
     - string 
     - Yes
     - 
     - The size of each Memcached instance in your cluster. See `Choosing Your Node Size <http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/CacheNodes.SelectSize.html>`_ for more details.
   * - memcached_version
     - string
     - Yes
     -
     - The version of Memcached to run. See `Comparing Memcached Versions <http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/SelectEngine.MemcachedVersions.html>`_ for a list of available versions.
   * - description
     - string
     - No
     - Parameter group for cluster.
     - The parameter group description of your cluster.
   * - node_count
     - number
     - No
     - 1
     - The number of memcached nodes you want in your cluster.
   * - cache_parameters
     - Map<string,string>
     - No
     - 
     - Any cache parameters you wish for your Memcached cluster. See `Memcached Specific Parameters <http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/ParameterGroups.Memcached.html>`_ for the list of parameters you can provide.
   * - tags
     - :ref:`tagging-resources`
     - No
     - 
     - Any tags you wish to apply to this Memcached cluster.

.. WARNING::

    Note that having more than 1 node in your cluster will greatly increase your cost. Each node you add to the cluster adds a full cache instance type node cost to your cluster cost.

    For example, if you have a Memcached cluster of size 1, using a cache.m4.large instance, it will cost about $112/month.

    If you have that same cache.m4.large type, but with a cluster size of 4, it will cost about $448/month since you are being charged for four full Memcached instances.

    **Be careful to calculate how much this service will cost you if you are using a cluster of more than 1 node.**

Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: my-memcached-cluster

    environments:
      dev:
        cache:
          type: memcached
          instance_type: cache.m3.medium
          memcached_version: 1.4.34
          node_count: 1
          cache_parameters:
            cas_disabled: 1
          tags:
            mytag: myvalue

Depending on this service
-------------------------
The Memcached service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_ADDRESS
     - The DNS name of the Memcached configuration endpoint address.
   * - <SERVICE_NAME>_PORT
     - The port on which the Memcached cluster is listening.

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The Memcached service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Memcached service does not consume events from other Handel services.
