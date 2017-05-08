.. _efs:

EFS (Elastic File System)
=========================
This page contains information about using the EFS (Elastic File System) service in Handel. This service provides an EFS mount for use by other compute services such as ElasticBeanstalk and ECS.

Parameters
----------
.. list-table::
   :header-rows: 1

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - performance_mode
     - string 
     - No
     - general_purpose
     - What kind of performance for the EFS mount. Allowed values: general_purpose, max_io
   * - tags
     - Tags
     - No
     - 
     - Any tags you wish to apply to this EFS mount.

Tags element
~~~~~~~~~~~~
The Tags element is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>

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

Depending on this service
-------------------------
The EFS service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <ENV_PREFIX>_MOUNT_DIR
     - The directory on the host where the EFS volume was mounted.

The <URL_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See :ref:`environment-variable-prefix` for information about the structure of this prefix.

Events produced by this service
-------------------------------
The EFS service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The EFS service does not consume events from other Handel services.