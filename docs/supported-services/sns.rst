.. _sns:

SNS (Simple Notification Service)
=================================
This document contains information about the SNS service supported in Handel. This Handel service provisions an SNS topic for use by your applications.

Parameters
----------
There are currently no parameters for this service.

Example Handel File
-------------------
This Handel file shows an SQS service being configured:

.. code-block:: yaml

    version: 1

    name: my-sns-topic

    environments:
      dev:
        queue:
          type: sns

Depending on this service
-------------------------
This service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <URL_PREFIX>_TOPIC_ARN
     - The AWS ARN of the created topic
   * - <URL_PREFIX>_TOPIC_NAME
     - The name of the created topic

The <URL_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See :ref:`environment-variable-prefix` for information about the structure of this prefix.

Events produced by this service
-------------------------------
The SNS service currently produces events for the following services types:

* SQS
* Lambda

Events consumed by this service
-------------------------------
The SNS service does not currently consume events from other Handel services.