.. _apiaccess:

API Access
==========
This document contains information about the API Access service supported in Handel. This Handel service allows you to add read-only access to AWS services in your application.

This service does not provision any AWS resources, it just serves to add additional permissions onto your applications.

.. NOTE::

    This service won't grant you permissions to publish to topics, read from data stores, etc. The permissions this service grants are read-only on the service level.

    As an example of how you would use this service, you may want to run a Lambda that inspects your EC2 instances to audit them for certain characteristics. You can use this *apiaccess* service to grant that read-only access to EC2 to give you that information. 
    
    Since this service provides limited read-only access, in the EC2 example you would not be able to do things like start instances, create AMIs, etc.

.. NOTE::

    This service does not currently support resource tagging.


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
     - This must always be *apiaccess* for this service type.
   * - aws_services
     - List<string>
     - Yes
     - 
     - A list of one or more AWS services for which to add permissions. See Supported Service Access below for the list of services you can specify.

Supported Service Access
~~~~~~~~~~~~~~~~~~~~~~~~
The following AWS services are supported in the *aws_services* element:

* beanstalk
* cloudformation
* cloudwatchevents
* codebuild
* codepipeline
* dynamodb
* ec2
* ecs
* efs
* elasticache
* lambda
* loadbalancing
* organizations
* rds
* route53
* s3
* sns
* sqs
* ssm

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
        orgsaccess:
          type: apiaccess
          aws_services:
          - organizations

Depending on this service
-------------------------
You can reference this service as a dependency in other services. It does not export any environment variables. Instead, it will just add a policy on the dependent service to allow read access to the services you listed.

Events produced by this service
-------------------------------
The API Access service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The API Access service does not consume events from other Handel services.