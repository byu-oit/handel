.. _alexaskillkit:

Alexa Skill Kit
=================
This document contains information about the Alexa Skill kit service supported in Handel. This Handel service provisions a Alexa Skill kit permission, which is used to integrate with Lambda to invoke them.

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
     - This must always be *alexaskillkit* for this service type.

Example Handel Files
--------------------

.. _alexaskillkit-lambda-example:

Example Lambda Config
~~~~~~~~~~~~~~~~~~~~~
This Handel file shows a Alexa Skill kit service being configured, producing to a Lambda:

.. code-block:: yaml

    version: 1

    name: my-alexaskill-lambda

    environments:
      dev:
        function:
          type: lambda
          path_to_code: .
          handler: app.handler
          runtime: nodejs6.10
        alexaskill:
          type: alexaskillkit
          event_consumers:
          - service_name: function

Depending on this service
-------------------------
The Alexa Skill Kit service cannot be referenced as a dependency for another Handel service. This service is intended to be used as a producer of events for other services.

Events produced by this service
-------------------------------
The Alexa Skill Kit service currently produces events for the following service types:

* Lambda

Events consumed by this service
-------------------------------
The Alexa Skill Kit service does not consume events from other Handel services.