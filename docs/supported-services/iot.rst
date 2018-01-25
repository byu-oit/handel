.. _iot:

IoT
===
This document contains information about the IoT service supported in Handel. This Handel service currently provisions IoT topic rules that can invoke things like Lambda functions.

Service Limitations
-------------------
This Handel service is quite new, and as such doesn't support all of IoT yet. In particular, the following are not supported:

* Creating IoT Things.
* Creating IoT Certificates.
* Creating IoT Policies.

.. IMPORTANT::

    This service only offers limited tagging support. IoT resources will not be tagged, but the Cloudformation stack used to create them will be. See :ref:`tagging-unsupported-resources`.


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
     - This must always be *iot* for this service type.
   * - description
     - string
     - No
     - AWS IoT rule created by Handel
     - The description you would like to be applied to the IoT rule.
   * - tags
     - :ref:`tagging-resources`
     - No
     -
     - Tags to be applied to the Cloudformation stack which provisions this resource.

Example Handel File
-------------------
The following example shows setting up an IoT topic rule to produce to a Lambda:

.. code-block:: yaml

    version: 1

    name: my-topic-rule

    environments:
      dev:
        topicrule:
          type: iot
          event_consumers:
          - service_name: function
            sql: "select * from 'something';"
        function:
          type: lambda
          path_to_code: .
          handler: index.handler
          runtime: nodejs6.10

Depending on this service
-------------------------
The IoT service cannot currently be specified as a dependency by any other services. It is currently only functioning as an event producer for other services such as Lambda.

Events produced by this service
-------------------------------
The IoT service can produce events to the following service types:

* Lambda

Event consumer parameters
~~~~~~~~~~~~~~~~~~~~~~~~~
When specifying event consumers on the IoT service, you may specify the following parameters:

.. list-table:: 
   :header-rows: 1

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - service_name
     - string
     - Yes
     - 
     - This is the name of the service in your Handel file to which you would like to produce events.
   * - sql
     - string
     - Yes
     - 
     - This is where you specify the `IoT-compatible SQL statement <http://docs.aws.amazon.com/iot/latest/developerguide/iot-sql-reference.html>`_ that will cause your rule to fire.
   * - description
     - string
     - No
     - AWS IoT rule created by Handel.
     - The description for the topic rule payload.
   * - rule_disabled:
     - boolean
     - No
     - false
     - This defines whether the topic rule is currently enabled or disabled.

Events consumed by this service
-------------------------------
The IoT service cannot currently consume events from other services.
