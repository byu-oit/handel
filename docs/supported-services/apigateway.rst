.. _apigateway:

API Gateway
===========
This document contains information about the API Gateway service supported in Handel. This Handel service provisions resources such as API Gateway and Lambda to provide a serverless HTTP application.

Service Limitations
-------------------
No Authorizer Lambdas
~~~~~~~~~~~~~~~~~~~~~
This service doesn't yet support specifying authorizer lambdas.

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
     - This must always be *apigateway* for this service type.
   * - proxy
     - :ref:`apigateway-proxy`
     - No
     -
     - Specify this section if you want a simple *proxy passthrough*, where all routes are directed to the same Lambda. You must specify either the *swagger* or *proxy* section, but not both.
   * - swagger
     - :ref:`apigateway-swagger`
     - No
     - 
     - Specify this section if you want to configure your API from a Swagger document. You must specify either the *swagger* or *proxy* section, but not both.
   * - description
     - string
     - No
     - Handel-created API
     - The configuration description of your Lambda function.
   * - binary_media_types
     - array
     - No
     -
     - A sequence (array) of BinaryMediaType strings. *Note* The handel will do the '/' to '~1' `character escaping <http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-payload-encodings-configure-with-control-service-api.html#api-gateway-payload-encodings-pass-binary-as-is>`_ for you.
   * - vpc
     - boolean
     - No
     - false
     - If true, your Lambdas will be deployed inside your account's VPC.
   * - tags
     - :ref:`apigateway-tags`
     - No
     - 
     - Any tags you want to apply to your API Gateway app.

.. _apigateway-proxy:

Proxy Passthrough
~~~~~~~~~~~~~~~~~
.. NOTE::

    If you specify the *proxy* section, you may not specify the *swagger* section.

You specify the *proxy* section when you want a single Lambda function that handles all requests from all paths. Use this option when you only have a single route, or you want to handle routing
in your code via a library.

The Proxy Passthrough section is defined by the following schema:

.. code-block:: yaml

    proxy:
      path_to_code: <string> # The path to the directory or artifact where your code resides.
      runtime: <string> # The Lambda runtime (such as nodejs6.10) to use for your handler function.
      handler: <string> # The function to call (such as index.handler) in your deployable code when invoking the Lambda. This is the Lambda-equivalent of your ‘main’ method.
      memory: <number> # The amount of memory (in MB) to provision for the runtime. Default: 128
      timeout: <number> # The timeout to use for your Lambda function. Any functions that go over this timeout will be killed. Default: 5
      environment_variables: # A set of key/value pairs to set as environment variables on your API.
        <STRING>: <string>
.. _apigateway-swagger:

Swagger Configuration
~~~~~~~~~~~~~~~~~~~~~
.. NOTE::

    If you specify the *swagger* section, you may not specify the *proxy* section.
  
You specify the *swagger* section when you want to have your API defined by a Swagger document that is serviced by one or more Lambda functions in any combination.

The Swagger section is defined by the following schema:

.. code-block:: yaml

    swagger: <string> # The path to the Swagger file in your repository

Handel Swagger Extensions
*************************
For the most part, the Swagger document you provide in the *swagger* section is just a regular Swagger document, 
specifying the API paths you want your app to use. Handel makes use of certain Swagger extensions in your Swagger document 
to know which Lambdas to create, and how to wire them to your API.

Consider the following vanilla Swagger document:

.. code-block:: json

    {
      "swagger": "2.0",
      "info": {
        "title": "my-cool-app",
        "description": "Test Swagger API",
        "version:": "1.0"
      },
      "paths": {
        "/": {
          "get": {
            "responses": {
              "200": {}
            }
          }
        }
      }
    }

This simple Swagger defines a single path "/" that will make up the API. In order for Handel to be able to create the API,
you need to add some custom extensions to your Handel file, telling how to create the Lambdas and wire them:

.. code-block:: json

    {
      "swagger": "2.0",
      "info": {
        "title": "my-cool-app",
        "description": "Test Swagger API",
        "version:": "1.0"
      },
      "paths": {
        "/": {
          "get": {
            "responses": {
              "200": {}
            },
            "x-lambda-function": "my-function-1"
          }
        }
      },
      "x-lambda-functions": {
        "my-function-1": {
          "runtime": "nodejs6.10",
          "handler": "index.handler",
          "memory": "128",
          "path_to_code": "./function1"
        }
      }
    }

Notice that the Swagger document now contains an *x-lambda-functions* section. This section contains a list of elements that define Lambda configurations. 
For each item in this list, Handel will create a Lambda function for you. These objects are defined by the following schema:

.. code-block:: none

    {
      "path_to_code": <string>, // The path to the directory or artifact where your code resides.
      "runtime": <string>, // The Lambda runtime (such as nodejs6.10) to use for your handler function.
      "handler": <string>, // The function to call (such as index.handler) in your deployable code when invoking the Lambda. This is the Lambda-equivalent of your ‘main’ method.
      "memory": <number>, // The amount of memory (in MB) to provision for the runtime. Default: 128,
      "timeout": <number>, // The timeout to use for your Lambda function. Any functions that go over this timeout will be killed. Default: 5
      "environment_variables": { // A set of key/value pairs to set as environment variables on your API.
        <ENV_NAME>: <env value> 
      }
    }

Also notice that the paths in your document have an *x-lambda-function* element. This element tells Handel which Lambda function from the *x-lambda-functions* section you want that API path to be serviced by.

.. _apigateway-tags:

Tags
~~~~
The Tags element is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>

.. NOTE::

    Handel automatically applies some tags for you. See :ref:`tagging-default-tags` for information about these tags.

Example Handel File
-------------------
Simple Proxy Passthrough
~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows an API Gateway service being configured, where all your requests on all paths go to a single Lambda function:

.. code-block:: yaml

    version: 1

    name: my-apigateway-app

    environments:
      dev:
        app:
          type: apigateway
          proxy:
            path_to_code: .
            lambda_runtime: nodejs6.10
            handler_function: index.handler
            provisioned_memory: 256
            function_timeout: 5
            environment_variables:
              MY_FIRST_VAR: my_first_value
              MY_SECOND_VAR: my_second_value

Swagger Configuration
~~~~~~~~~~~~~~~~~~~~~
This Handel file shows an API Gateway service being configured, where your API definition is defined by a Swagger file:

.. code-block:: yaml

    version: 1

    name: my-apigateway-app

    environments:
      dev:
        app:
          type: apigateway
          swagger: ./swagger.json

The above file assumes a Swagger file called *swagger.json* is present in the same directory as the Handel file. Here is an example Swagger file:

.. code-block:: json

    {
      "swagger": "2.0",
      "info": {
        "title": "my-cool-app",
        "description": "Test Swagger API",
        "version:": "1.0"
      },
      "paths": {
        "/": {
          "get": {
            "responses": {
              "200": {}
            },
            "x-lambda-function": "my-function-1"
          }
        },
        "/test1": {
          "get": {
            "responses": {
              "200": {}
            },
            "x-lambda-function": "my-function-2"
          }
        }
      },
      "x-lambda-functions": {
        "my-function-1": {
          "runtime": "nodejs6.10",
          "handler": "index.handler",
          "memory": "128",
          "path_to_code": "./function1"
        },
        "my-function-2": {
          "runtime": "nodejs6.10",
          "handler": "index.handler",
          "memory": "256",
          "path_to_code": "./function2"
        }
      }
    }

Depending on this service
-------------------------
The API Gateway service cannot be referenced as a dependency for another Handel service

Events produced by this service
-------------------------------
The API Gateway service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The API Gateway service does not consume events from other Handel services.
