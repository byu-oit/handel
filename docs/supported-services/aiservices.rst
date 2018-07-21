.. _aiservices:

AI Services
===========
This document contains information about the AI Services provisioner supported in Handel. This Handel service allows you to access to AWS' AI services in your application.

This service does not create any AWS resources since the AI services are consumed via an HTTP API. Even though you don't have provisioned resources, you still pay for each API call made to the AWS AI services.


Service Limitations
-------------------
No Rekognition Streams Support
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This service doesn't support Rekognition's Kinesis video stream processors.


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
     - This must always be *aiservices* for this service type.
   * - ai_services
     - List<string>
     - Yes
     - 
     - A list of one or more AWS AI services for which to add permissions. See Supported Service Access below for the list of services you can specify.

Supported Service Access
~~~~~~~~~~~~~~~~~~~~~~~~
The following AWS services are supported in the *aws_services* element:

* rekognition

Example Handel File
-------------------
This Handel file shows an API Gateway service being configured with API access to the Organizations service

.. code-block:: yaml

    version: 1

    name: my-apigateway-app

    environments:
      dev:
        app:
          type: apigateway
          path_to_code: .
          lambda_runtime: nodejs6.10
          handler_function: index.handler
          dependencies:
          - aiaccess
        aiaccess:
          type: aiservices
          ai_services:
          - rekognition

Depending on this service
-------------------------
You can reference this service as a dependency in other services. It does not export any environment variables. Instead, it will just add a policy on the dependent service to allow access to the services you listed.

Events produced by this service
-------------------------------
The AI Services provisioner does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The AI Services provisioner does not consume events from other Handel services.