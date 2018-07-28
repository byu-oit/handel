.. _neptune:

Neptune
=======
This page contains information about using the Neptune service in Handel. This service provides a Neptune graph database cluster.

.. WARNING::

    This provisioner is new and should be considered in beta. It is subject to breaking changes until this beta label is removed.

Service Limitations
-------------------
No Update Support
~~~~~~~~~~~~~~~~~
This service intentionally does not support updates. Once a database is created, certain updates to the database will cause a new database to be created and the old one deleted. In an effort to avoid unwanted data loss, we don't update this service automatically. You can still modify the database and parameter group manually in the AWS console.

.. WARNING::

    Make sure you know what you're doing when you modify your Neptune database in the AWS Console. Certain actions will cause database downtime, and some may even cause the database to be recreated.

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
     - This must always be *neptune* for this service type.
   * - description
     - string
     - No
     - 
     - The description on the resources created for the cluster
   * - instance_type
     - string
     - No
     - db.r4.large
     - The size of database instance to run. See `Neptune pricing <https://aws.amazon.com/neptune/pricing/>`_ for the allowed instance types.
   * - cluster_size
     - number
     - No
     - 1
     - The number of instances (including the primary) to run in your cluster.
   * - cluster_parameters
     - map<string, string>
     - No
     - 
     - A list of key/value Neptune cluster parameter group pairs to configure your cluster. You will need to look in the AWS Console to see the list of available cluster parameters for Neptune.
   * - instance_parameters
     - map<string, string>
     - No
     - 
     - A list of key/value Neptune instance parameter group pairs to configure the instances in your cluster. You will need to look in the AWS Console to see the list of available instance parameters for Neptune.
   * - tags
     - :ref:`tagging-resources`
     - No
     - 
     - Any tags you wish to apply to this Neptune cluster.
     
.. WARNING::

    Be aware that Neptune clusters can be very expensive. A cluster with 3 *db.r4.2xlarge* instances in it will cost about about $3,000/month. Make sure you check how much you will be paying!


Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: neptune-test

    environments:
      dev:
        database:
          type: neptune
          instance_type: db.r4.large
          cluster_size: 3
          cluster_parameters: # This is where you can set parameters that configure the cluster as a whole
            neptune_enable_audit_log: 0
          instance_parameters: # This is where you can set parameters that apply to each instance.
            neptune_query_timeout: 120000
          tags:
            some: tag

Depending on this service
-------------------------
The Neptune service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_CLUSTER_ENDPOINT
     - The address that you should use for writes to the database.
   * - <SERVICE_NAME>_READ_ENDPOINT
     - The address that you should use for reads to the database.
   * - <SERVICE_NAME>_PORT
     - The port on which the Neptune cluster instances are listening.

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The Neptune service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Neptune service does not consume events from other Handel services.
