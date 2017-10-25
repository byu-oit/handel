.. _redis:

Redis (ElastiCache)
===================
This page contains information about using the Redis service in Handel. This service provides a Redis cluster via the ElastiCache service.

Service Limitations
-------------------

No Cluster Mode Support
~~~~~~~~~~~~~~~~~~~~~~~
This service currently does not support using Redis in cluster mode. It does support replication groups with a primary node and 1 or more read replicas, but it doesn't yet support Redis' cluster mode sharding.

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
     - This must always be *redis* for this service type.
   * - instance_type
     - string 
     - Yes
     - 
     - The size of each Redis instance in your cluster. See `Choosing Your Node Size <http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/CacheNodes.SelectSize.html>`_ for more details.
   * - redis_version
     - string
     - Yes
     -
     - The version of Redis to run. See `Comparing Redis Versions <http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/SelectEngine.RedisVersions.html>`_ for a list of available versions.
   * - description
     - string
     - No
     - Parameter group.
     - The redis group description.
   * - maintenance_window
     - string
     - No
     - 
     - The weekly time range (in UTC) during which ElastiCache may peform maintenance on the node group. For example, you can specify Sun:05:00-Tue:09:00.
   * - read_replicas
     - number
     - No
     - 0
     - The number of read replicas you want to provision. Allowed values: 0-5.
   * - snapshot_window
     - string
     - No
     - 
     - The daily time range (in UTC) during which ElastiCache will begin taking a daily snapshot of your node group. For example, you can specify 05:00-09:00. This feature is not available on the t2 and t1 instance types.
   * - cache_parameters
     - Map<string,string>
     - No
     - 
     - Any cache parameters you wish for your Redis cluster. See `Redis Specific Parameters <http://docs.aws.amazon.com/AmazonElastiCache/latest/UserGuide/ParameterGroups.Redis.html>`_ for the list of parameters you can provide.
   * - tags
     - :ref:`redis-tags`
     - No
     - 
     - Any tags you wish to apply to this Redis cluster.
     
.. WARNING::

    If you use read replicas, be aware that it will greatly increase your cost. Each read replica you use adds the full cost of another Redis node. 

    For example, if you have a single cache.m4.large Redis instance with no read replicas, it will cost about $112/month.

    If you have that same cache.m4.large type, but with 1 read replica, it will cost you double at about $224/month since you are being charged for two full Redis instances.

    Taken to its extreme, a cache.m4.large with 5 read replicas will cost about $673/month. **Be careful to calculate how much this service will cost you if you are using read replicas**

.. _redis-tags:

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
   * - <SERVICE_NAME>_ADDRESS
     - The DNS name of the primary Redis node
   * - <SERVICE_NAME>_PORT
     - The port on which the primary Redis node is listening.

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The Redis service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Redis service does not consume events from other Handel services.
