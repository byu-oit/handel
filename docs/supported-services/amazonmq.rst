.. _amazonmq:

Amazon MQ
=========
This document contains information about the Amazon MQ provisioner supported in Handel. This Handel service allows you to provision an ActiveMQ broker in AWS.

.. WARNING::

    This provisioner is new and should be considered in beta. It is subject to breaking changes until this beta label is removed.

Service Limitations
-------------------
No Custom Configuration Support
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This service doesn't support providing a custom ActiveMQ configuration yet.


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
     - This must always be *amazonmq* for this service type.
   * - instance_type
     - string
     - No
     - mq.t2.micro
     - The Amazon MQ EC2 instance type that you wish to use for your broker. See `Amazon MQ Pricing <https://aws.amazon.com/amazon-mq/pricing/>`_ for details on the allowed instance types.
   * - multi_az
     - boolean
     - No
     - false
     - Whether or not you want to deploy your broker in multi-AZ high availability mode.
   * - general_logging
     - boolean
     - No
     - false
     - Whether or not you want general logging to be enabled for your broker.
   * - audit_logging
     - boolean
     - No
     - false
     - Whether or not you want audit logging to be enabled for your broker.


Depending on this service
-------------------------
The Amazon MQ service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_BROKER_ID
     - The ID of the created broker.

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The Amazon MQ provisioner does not produce AWS events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Amazon MQ provisioner does not consume AWS events from other Handel services.