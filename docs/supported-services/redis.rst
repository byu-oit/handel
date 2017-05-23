.. _redis:

Redis (ElastiCache)
===================
This page contains information about using the Redis service in Handel. This service provides a Redis cluster via the ElastiCache service.

Service Limitations
-------------------

No Cluster Mode Support
~~~~~~~~~~~~~~~~~~~~~~~
This service currently does not support using Redis in cluster mode. It does support replication groups with a primary node and 1 or more read replicas, but it doesn't yet support Redis' cluster mode sharding.

No Scheduled Maintenance Window Configuration
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This service currently doesn't allow you to change the maintenance window for your Redis cluster.

No Snapshot Window Configuration
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This service currently doesn't allow you to change the snapshot window for your Redis cluster.

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
   * - instance_type
     - string 
     - yes
     - 
     - The size of each Redis instance in your cluster. See `Choosing Your Node Size <http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/CacheNodes.SelectSize.html>`_ for more details.
   * - redis_version
     - string
     - yes
     -
     - The version of Redis to run. See `Comparing Redis Versions <http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/SelectEngine.RedisVersions.html>`_ for a list of available versions.
   * - read_replicas:
     - number
     - no
     - 0
     - The number of read replicas you want to provision. Allowed values: 0-5.
   * - cache_parameters:
     - Map<string,string>
     - no
     - 
     - Any cache parameters you wish for your Redis cluster. See `Redis Specific Parameters <http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/ParameterGroups.Redis.html>`_ for the list of parameters you can provide.
   * - tags
     - Tags
     - No
     - 
     - Any tags you wish to apply to this Redis cluster.
     
.. WARNING::

    If you use read replicas, be aware that it will greatly increase your cost. Each read replica you use adds the full cost of another Redis node. 

    For example, if you have a single cache.m4.large Redis instance with no read replicas, it will cost about $112/month.

    If you have that same cache.m4.large type, but with 1 read replica, it will cost you double at about $224/month since you are being charged for two full Redis instances.

    Taken to its extreme, a cache.m4.large with 5 read replicas will cost about $673/month. **Be careful to calculate how much this service will cost you if you are using read replicas**

Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: my-redis-cluster

    environments:
      dev:
        cache:
          type: redis
          instance_type: cache.m3.medium
          redis_version: 3.2.4
          read_replicas: 1
          cache_parameters:
            activerehashing: 'no'
          tags:
            mytag: myvalue

Depending on this service
-------------------------
The Redis service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <ENV_PREFIX>_ADDRESS
     - The DNS name of the primary Redis node
   * - <ENV_PREFIX>_PORT
     - The port on which the primary Redis node is listening.

The <URL_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See :ref:`environment-variable-prefix` for information about the structure of this prefix.

Events produced by this service
-------------------------------
The Redis service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Redis service does not consume events from other Handel services.