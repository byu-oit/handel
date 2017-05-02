Lambda
======
This document contains information about the Lambda service supported in Handel. This Handel service provisions an Lambda function. You can reference this function in other services as an event consumer, which will invoke the function when events occur.

Service Limitations
-------------------
The following Lambda features are not currently supported in this service:

* Running Lambdas inside VPCs. 
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
   * - path_to_code
     - string
     - Yes
     - 
     - The location of your code to upload to Lambda. This can be a directory (which will be zipped up) or a single file (such as a deployable Java WAR file or pre-existing [zip file](https://www.google.com/search?q=aws+lambda+zip+deployment+package))
   * - handler
     - string
     - Yes
     - 
     - The [handler function](https://www.google.com/search?q=aws+lambda+handler) in your code that is the entry-point to the Lambda.
   * - runtime
     - string
     - Yes
     - 
     - The [Lambda runtime](http://docs.aws.amazon.com/lambda/latest/dg/API_CreateFunction.html#SSS-CreateFunction-request-Runtime) that will execute your code
   * - memory
     - string
     - No
     - 128
     - The [amount of memory](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-function.html#cfn-lambda-function-memorysize) to allocate for your function
   * - timeout
     - string
     - No
     - 3
     - The timeout in seconds for your function. Max 300
   * - environment_variables
     - EnvironmentVariables
     - No
     - 
     - Any environment variables you want to inject into your code.

EnvironmentVariables element
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
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

Running a scheduled Lambda
--------------------------
To run a scheduled Lambda, you can use this service in conjunction with the CloudWatch Events service. See the [example](https://github.com/byu-oit-appdev/handel/wiki/CloudWatch-Events#example-handel-file) on the CloudWatch Events service for details on how to do this.

Depending on this service
-------------------------
The Lambda service cannot currently be consumed by any other services. It is intended as an event consumer for other services such as SNS.

Events produced by this service
-------------------------------
The Lambda service does not currently produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Lambda service can consume events from the following service types:

* SNS