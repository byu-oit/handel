.. _sqs:

SQS (Simple Queue Service)
==========================
This document contains information about the SQS service supported in Handel. This Handel service provisions an SQS queue for use by your applications.

Service Limitations
-------------------

.. IMPORTANT::

    This service only offers limited tagging support. SNS Topics will not be tagged, but the Cloudformation stack used to create them will be. See :ref:`tagging-unsupported-resources`.


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
     - This must always be *sqs* for this service type.
   * - queue_type
     - string
     - No
     - regular
     - The type of queue to create. Allowed values are "regular" and "fifo".
   * - delay_seconds
     - number
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
   * - dead_letter_queue
     - :ref:`sqs-dead-letter`
     - No
     -
     - If present, indicates that the queue will use a `Dead-Letter Queue <http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html>`_.
   * - tags
     - :ref:`tagging-resources`
     - No
     -
     - Tags to be applied to the Cloudformation stack which provisions this resource.


.. _sqs-dead-letter:

DeadLetterQueue
~~~~~~~~~~~~~~~
The `dead_letter_queue` section is defined by the following schema:

.. code-block:: yaml

    dead_letter_queue:
      max_receive_count: <number> # Optional.  Default: 3
      delay_seconds: <number> # Optional. Default: 0
      max_message_size: <number> # Optional. Default 1: queue max_message_size. Default 2: 262144
      message_retention_period: <number> # Optional. Default 1: queue message_retention_period. Default 2: 345600
      receive_message_wait_time_seconds: <number> # Optional. Default 1: queue receive_message_wait_time_seconds. Default 2: 0
      visibility_timeout: <number> # Optional. Default 1: queue visibility_timeout.  Default 2: 30

If you want to use the default values, set `dead_letter_queue` to true:

.. code-block:: yaml

    dead_letter_queue: true


Example Handel Files
--------------------
Simple Configuration
~~~~~~~~~~~~~~~~~~~~
This Handel file shows a basic SQS service being configured:

.. code-block:: yaml

    version: 1

    name: my-sqs-queue

    environments:
      dev:
        queue:
          type: sqs

Dead-Letter Queue
~~~~~~~~~~~~~~~~~
This Handel file shows an SQS service being configured with a `Dead-Letter Queue <http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html>`_:

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
          receive_message_wait_time_seconds: 3
          visibility_timeout: 40
          dead_letter_queue:
            max_receive_count: 5
            queue_type: fifo
            content_based_deduplication: true
            delay_seconds: 2
            max_message_size: 262140
            message_retention_period: 345601
            receive_message_wait_time_seconds: 4
            visibility_timeout: 40
  
Lambda Events
~~~~~~~~~~~~~
This Handel file shows an SQS service configured with events to Lambda enabled:

.. code-block:: yaml

    version: 1

    name: my-sqs-queue

    environments:
      dev:
        queue:
          type: sqs
          event_consumers:
          - service_name: function
            batch_size: 10
        function:
          type: lambda
          path_to_code: .
          handler: index.handler
          runtime: nodejs10.x

Depending on this service
-------------------------
The SQS service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_QUEUE_NAME
     - The name of the created queue
   * - <SERVICE_NAME>_QUEUE_URL
     - The HTTPS URL of the created queue
   * - <SERVICE_NAME>_QUEUE_ARN
     - The AWS ARN of the created queue

If you have a Dead-Letter Queue, the SQS service also outputs the following environment variables:

.. list-table::
    :header-rows: 1

    * - Environment Variable
      - Description
    * - <SERVICE_NAME>_DEAD_LETTER_QUEUE_NAME
      - The name of the created dead-letter queue
    * - <SERVICE_NAME>_DEAD_LETTER_QUEUE_URL
      - The HTTPS URL of the created dead-letter queue
    * - <SERVICE_NAME>_DEAD_LETTER_QUEUE_ARN
      - The AWS ARN of the created dead-letter queue

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The SQS service produces events to the following service types:

* Lambda

You can configure events to Lambda using the `event_consumers` parameter in your SQS service:

.. code-block:: yaml

  event_consumers:
  - service_name: <string> # Required.  The service name of the lambda function
    batch_size: <number> # Required. Allowed Values: 1-10

Events consumed by this service
-------------------------------
The SQS service can currently consume events from the following Handel services:

* S3
* SNS
