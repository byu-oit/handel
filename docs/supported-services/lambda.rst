.. _lambda:

Lambda
======
This document contains information about the Lambda service supported in Handel. This Handel service provisions an Lambda function. You can reference this function in other services as an event consumer, which will invoke the function when events occur.

Service Limitations
-------------------
The following Lambda features are not currently supported in this service:

* Encrypting environment variables with KMS keys

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
     - This must always be *lambda* for this service type.
   * - path_to_code
     - string
     - Yes
     - 
     - The location of your code to upload to Lambda. This can be a directory (which will be zipped up) or a single file (such as a deployable Java WAR file or pre-existing `zip file <https://www.google.com/search?q=aws+lambda+zip+deployment+package>`_)
   * - handler
     - string
     - Yes
     - 
     - The `handler function <https://www.google.com/search?q=aws+lambda+handler>`_ in your code that is the entry-point to the Lambda.
   * - runtime
     - string
     - Yes
     - 
     - The `Lambda runtime <http://docs.aws.amazon.com/lambda/latest/dg/API_CreateFunction.html#SSS-CreateFunction-request-Runtime>`_ that will execute your code
   * - description
     - string
     - No
     - Handel-created function
     - The configuration description of your function
   * - memory
     - string
     - No
     - 128
     - The `amount of memory <http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-function.html#cfn-lambda-function-memorysize>`_ to allocate for your function
   * - timeout
     - string
     - No
     - 3
     - The timeout in seconds for your function. Max 300
   * - vpc
     - boolean
     - No
     - false
     - If true, the lambda will be deployed inside your VPC. Inside your VPC, it will be able to communicate with resources like RDS databases and ElastiCache clusters.
   * - environment_variables
     - :ref:`lambda-environment-variables`
     - No
     - 
     - Any environment variables you want to inject into your code.
   * - tags
     - :ref:`tagging-resources`
     - No
     - 
     - Any tags you want to apply to your Lambda

.. _lambda-environment-variables:

EnvironmentVariables
~~~~~~~~~~~~~~~~~~~~
The EnvironmentVariables element is defined by the following schema:

.. code-block:: yaml

    environment_variables:
      <YOUR_ENV_NAME>: <your_env_value>

<YOUR_ENV_NAME> is a string that will be the name of the injected environment variable. <your_env_value> is its value. You may specify an arbitrary number of environment variables in this section.

Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: my-lambda

    environments:
      dev:
        webapp:
          type: lambda
          path_to_code: .
          handler: index.handler
          runtime: nodejs6.10
          environment_variables:
            MY_ENV: myEnvValue
          tags:
            mytag: mytagvalue

Running a scheduled Lambda
--------------------------
To run a scheduled Lambda, you can use this service in conjunction with the CloudWatch Events service. See the :ref:`cloudwatch-scheduled-lambda-example` on the CloudWatch Events service for details on how to do this.

Depending on this service
-------------------------
The Lambda service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_FUNCTION_NAME
     - The name of the created Lambda function
   * - <SERVICE_NAME>_FUCNTION_ARN
     - The ARN of the created Lambda function

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.


Events produced by this service
-------------------------------
The Lambda service does not currently produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Lambda service can consume events from the following service types:

* Alexa Skill Kit
* CloudWatch Events
* DynamoDB
* IoT
* S3
* SNS
