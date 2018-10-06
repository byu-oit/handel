Welcome to Handel's documentation!
==================================
Handel is a library that orchestrates your AWS deployments so you don't have to.

Handel is built on top of CloudFormation with an aim towards easier AWS provisioning and deployments. 
You give Handel a configuration file (the *Handel file*) telling it what services you want in your application, and it 
wires them together for you. 

Here's an example Handel file defining a Beanstalk application to be deployed with an SQS queue and S3 bucket:

.. code-block:: yaml

    version: 1

    name: my-first-handel-app

    environments:
      dev:
        webapp:
          type: beanstalk
          path_to_code: .
          solution_stack: 64bit Amazon Linux 2017.09 v4.4.5 running Node.js
          dependencies:
          - bucket
          - queue
        bucket:
          type: s3
        queue:
          type: sqs

From this Handel file, Handel creates the appropriate CloudFormation templates for you,
including taking care of all the tricky security bits to make the services be able to talk to each other.

.. toctree::
   :maxdepth: 1
   :caption: Getting Started

   getting-started/introduction
   getting-started/handel-vs-cloudformation
   getting-started/installation
   getting-started/tutorial-creating-an-app
   getting-started/cli-reference

.. _handel-basics:

.. toctree::
   :maxdepth: 1
   :caption: Handel Basics

   handel-basics/handel-file
   handel-basics/account-config-file
   handel-basics/service-dependencies
   handel-basics/consuming-service-dependencies
   handel-basics/service-events
   handel-basics/accessing-secrets
   handel-basics/tagging
   handel-basics/deleting-an-environment
   handel-basics/using-extensions

.. _supported-services:

.. toctree::
   :maxdepth: 1
   :caption: Supported Services

   supported-services/alexaskillkit
   supported-services/aiservices
   supported-services/amazonmq
   supported-services/apiaccess
   supported-services/apigateway
   supported-services/aurora
   supported-services/aurora-serverless
   supported-services/codedeploy
   supported-services/beanstalk
   supported-services/cloudwatchevents
   supported-services/dynamodb
   supported-services/ecs
   supported-services/ecs-fargate
   supported-services/efs
   supported-services/elasticsearch
   supported-services/iot
   supported-services/kms
   supported-services/lambda
   supported-services/memcached
   supported-services/mysql
   supported-services/neptune
   supported-services/postgresql
   supported-services/redis
   supported-services/route53zone
   supported-services/s3
   supported-services/s3staticsite
   supported-services/ses
   supported-services/sns
   supported-services/sqs
   supported-services/stepfunctions

.. _extensions:

.. toctree::
   :maxdepth: 1
   :caption: Advanced

   advanced/deployment-logs
   advanced/writing-extensions
