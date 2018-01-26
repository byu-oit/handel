.. _efs:

EFS (Elastic File System)
=========================
This page contains information about using the EFS (Elastic File System) service in Handel. This service provides an EFS mount for use by other compute services such as ElasticBeanstalk and ECS.

Service Limitations
-------------------
No Update Support
~~~~~~~~~~~~~~~~~
This service intentionally does not support updates. Once a file system is created, updates to it (like changing the performance mode) will cause a new file system to be created and the old one deleted. 
In an effort to avoid unwanted data loss, we don’t update this service automatically.

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
     - This must always be *efs* for this service type.
   * - performance_mode
     - string 
     - No
     - general_purpose
     - What kind of performance for the EFS mount. Allowed values: general_purpose, max_io
   * - tags
     - :ref:`tagging-resources`
     - No
     - 
     - Any tags you wish to apply to this EFS mount.

Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: my-efs-app

    environments:
      dev:
        webapp:
          type: efs
          performance_mode: general_purpose
          tags:
            mytag: myvalue

Depending on this service
-------------------------
The EFS service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_MOUNT_DIR
     - The directory on the host where the EFS volume was mounted.

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The EFS service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The EFS service does not consume events from other Handel services.