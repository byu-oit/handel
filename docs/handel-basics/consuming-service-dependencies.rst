.. _consuming-service-dependencies:

Consuming Service Dependencies
==============================
When you specify a dependency on a service using :ref:`service-dependencies`, that service is auto-wired to your application. This page contains information about how you can consume those injected dependencies in your application code to actually communicate with these services.

When Handel wires services together securely, it will inject environment variables into the consuming service for each service that it depends on. These environment variables provide information about the created service that tell you information such as where to find the service and how to communicate with it. 

The following Handel file defines a Beanstalk service that depends on an SQS queue:

.. code-block:: yaml

    version: 1

    name: beanstalk-example

    environments:
      dev:
        webapp:
          type: beanstalk
          path_to_code: .
          solution_stack: 64bit Amazon Linux 2016.09 v4.0.1 running Node.js
          instance_type: t2.micro
          health_check_url: /
          min_instances: 1
          max_instances: 1
          dependencies:
          - queue
        queue:
          type: sqs

Handel will inject environment variables in the Beanstalk application for the SQS queue, such as the queue's ARN, name, and URL. You can read these environment variables when you are writing code to communicate with the queue.

.. _environment-variable-prefix:

Environment Variable Prefix
---------------------------
Every environment variable injected by Handel for service dependencies has a common prefix in the environment variable name. 

This URL prefix is defined with the following structure:

.. code-block:: none

   <service_type>_<app_name>_<environment_name>_<service_name>

These values come from the service dependency in your Handel file. In the above example, the referencing Beanstalk application would need to use the following values in that prefix:

.. code-block:: none
   
    service_type = "sqs"
    app_name = "beanstalk-example"
    environment_name = "dev"
    service_name = "queue"

.. NOTE::
   All Handel injected environment variables will be all upper-cased, with dashes converted to underscores. In the above example, the Beanstalk application would need to use the following prefix for the SQS queue: 
   
   .. code-block:: none

      SQS_BEANSTALK_EXAMPLE_DEV_QUEUE

   Note that everything in the above prefix is upper-cased, and the app name "beanstalk-example" has been converted to to use underscores instead of dashes

.. _parameter-store-prefix:

Parameter Store Prefix
----------------------
Handel puts auto-generated credentials and other secrets in the EC2 Parameter Store, and it wires up your applications to allow you to access these secrets.

Each parameter Handel puts in the parameter store has a common prefix, which is defined by the following structure:

.. code-block:: none

    <app_name>.<environment_name>.<service_name>

These values come from the service dependency in your Handel file. In the above example, the referencing Beanstalk application would need to use the following values in that prefix:

.. code-block:: none
   
    app_name = "beanstalk-example"
    environment_name = "dev"
    service_name = "queue"
