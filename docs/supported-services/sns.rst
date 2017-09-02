.. _sns:

SNS (Simple Notification Service)
=================================
This document contains information about the SNS service supported in Handel. This Handel service provisions an SNS topic for use by your applications.

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
     - This must always be *sns* for this service type.
   * - subscriptions
     - :ref:`sns-subscriptions`
     - No
     -
     - An optional list of statically-defined subscriptions. You can also dynamically add subscriptions in your application code.

.. _sns-subscriptions:

Subscriptions
~~~~~~~~~~~~~
The Subscription element is defined by the following schema:

.. code-block:: yaml

    subscriptions:
      - endpoint: <string>
        protocol: <http|https|email|email-json|sms>

See the `SNS subscription documentation <http://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html>`_ for full details on configuring endpoints and protocols.

.. NOTE::

    Protocols `sqs`, `application`, and `lambda` are supported through :ref:`service-events`.

Example Handel File
-------------------
This Handel file shows an SQS service being configured:

.. code-block:: yaml

    version: 1

    name: my-sns-topic

    environments:
      dev:
        topic:
          type: sns
          subscriptions:
            - endpoint: fake@example.com
              protocol: email

Depending on this service
-------------------------
This service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_TOPIC_ARN
     - The AWS ARN of the created topic
   * - <SERVICE_NAME>_TOPIC_NAME
     - The name of the created topic

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The SNS service currently produces events for the following services types:

* SQS
* Lambda

Events consumed by this service
-------------------------------
The SNS service does not currently consume events from other Handel services.