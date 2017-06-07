.. _sqs:

SQS (Simple Queue Service)
==========================
This document contains information about the SQS service supported in Handel. This Handel service provisions an SQS queue for use by your applications.

Parameters
----------

.. list-table::
   :header-rows: 1

   * - queue_type
     - string
     - No
     - regular
     - The type of queue to create. Allowed values are "regular" and "fifo".
   * - delay_seconds
     - string
     - No
     - 0
     - The amount of time the queue delays delivery of messages.
   * - content_based_deduplication
     - boolean
     - No
     - false
     - Whether to enable content-based deduplication. This value only applies when the queue_type is "fifo".
   * - max_message_size
     - number
     - No
     - 262144
     - The max message size in bytes. Allowed values: 0 - 262144
   * - message_retention_period
     - number
     - No
     - 345600
     - The amount of time in seconds to retain messages. Allowed values: 60 - 1209600
   * - receive_message_wait_time_seconds
     - number
     - No
     - 0
     - The number of seconds ReceiveMessage will wait for messages to be available. Allowed values: 0-20. See `Amazon SQS Long Polling <http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-long-polling.html>`_ for more information.
   * - visibility_timeout
     - number
     - No
     - 30
     - The amount of time a message will be unavailable after it is delivered from the queue. Allowed values: 0 - 43200

Example Handel File
-------------------
This Handel file shows an SQS service being configured:

.. code-block:: yaml

    version: 1

    name: my-sqs-queue

    environments:
      dev:
        queue:
          type: sqs
          queue_type: fifo
          content_based_deduplication: true
          delay_seconds: 2
          max_message_size: 262140
          message_retention_period: 345601
          visibility_timeout: 40

Depending on this service
-------------------------
The SQS service outputs the following environment variables:

.. list-table:: 
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <URL_PREFIX>_QUEUE_NAME
     - The name of the created queue
   * - <URL_PREFIX>_QUEUE_URL
     - The HTTPS URL of the created queue
   * - <URL_PREFIX>_QUEUE_ARN
     - The AWS ARN of the created queue

The <URL_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See :ref:`environment-variable-prefix` for information about the structure of this prefix.

Events produced by this service
-------------------------------
The SQS service does not produce events for other Handel services.

Events consumed by this service
-------------------------------
The SQS service can currently consume events from the following Handel services:

* SNS