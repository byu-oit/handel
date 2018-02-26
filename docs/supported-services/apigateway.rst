.. _apigateway:

API Gateway
===========
This document contains information about the API Gateway service supported in Handel. This Handel service provisions resources such as API Gateway and Lambda to provide a serverless HTTP application.

Service Limitations
-------------------
No Authorizer Lambdas
~~~~~~~~~~~~~~~~~~~~~
This service doesn't yet support specifying authorizer lambdas.

No Regional Endpoints
~~~~~~~~~~~~~~~~~~~~~

This service currently supports only edge-optimized API Gateways.

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
   * - custom_domains
     - Array of :ref:`apigateway-custom-domains`
     - No
     -
     - An array of custom domains to map to this API Gateway instance.
   * - tags
     - :ref:`tagging-resources`
     - No
     - 
     - Any tags you want to apply to your API Gateway app.

.. _apigateway-custom-domains:

Custom Domain Mappings
~~~~~~~~~~~~~~~~~~~~~~
.. NOTE::

    This service does not currently support sharing custom domains between API Gateway instances using Base Path Mappings.
    At this time, you can only map one API Gateway to one custom domain, with no path mapping.

API Gateway allows for mapping gateways to one or more custom domains. These custom domains are always served via HTTPS.

The Custom Domains section is defined by the following schema:

.. code-block:: yaml

    custom_domains:
    - dns_name: <string> # The DNS name for the API Gateway. Must be a valid DNS name.
      https_certificate: <arn> # The Amazon Certificate Manager certificate to use. This certificate must be in the us-east-1 region.

See :ref:`route53zone-records` for more information on how DNS records will be created.

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

Lambda Swagger Extensions
*************************
For the most part, the Swagger document you provide in the *swagger* section is just a regular Swagger document, 
specifying the API paths you want your app to use. If you're using Lambdas to service your API Gateway resources, 
Handel makes use of certain Swagger extensions in your Swagger document so that it can create and wire your Lambdas
for you.

Consider the following Swagger document:

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

Notice that this is just a vanilla Swagger document for the most part. It does have some Handel-provided extensions, however. Notice that the Swagger 
document contains an *x-lambda-functions* section. This section contains a list of elements that define Lambda configurations. 
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

The above example just shows the easy Lambda proxy functionality in API Gateway. This will effectively pass all requests through to your Lambda without modification. If you want to use API Gateway's integration 
functionality to have more complex transformations before sending requests to your Lambda, you can use Handel to do this. Just provide the regular Amazon *x-amazon-apigateway-integration* value in your Swagger file:

.. code-block:: none

    {
      "swagger": "2.0",
      "info": {
        "version": "2016-09-12T23:19:28Z",
        "title": "MyAPI"
      },
      "basePath": "/test",
      "schemes": [
        "https"
      ],
      "paths": {
        "/{myparam}": {
          "get": {
            "produces": [
              "application/json"
            ],
            "responses": {},
            "x-lambda-function": "my-function-1"
            "x-amazon-apigateway-integration": {
              "requestTemplates": {
                "application/json": "#set ($root=$input.path('$')) { \"stage\": \"$root.name\", \"user-id\": \"$root.key\" }",
                "application/xml": "#set ($root=$input.path('$')) <stage>$root.name</stage> "
              },
              "requestParameters": {
                "integration.request.path.myparam": "method.request.querystring.version",
                "integration.request.querystring.provider": "method.request.querystring.vendor"
              },
              "cacheNamespace": "cache namespace",
              "cacheKeyParameters": [],
              "responses": {
                "2\\d{2}": {
                  "statusCode": "200",
                  "responseParameters": {
                    "method.response.header.requestId": "integration.response.header.cid"
                  },
                  "responseTemplates": {
                    "application/json": "#set ($root=$input.path('$')) { \"stage\": \"$root.name\", \"user-id\": \"$root.key\" }",
                    "application/xml": "#set ($root=$input.path('$')) <stage>$root.name</stage> "
                  }
                },
                "302": {
                  "statusCode": "302",
                  "responseParameters": {
                    "method.response.header.Location": "integration.response.body.redirect.url"
                  }
                },
                "default": {
                  "statusCode": "400",
                  "responseParameters": {
                    "method.response.header.test-method-response-header": "'static value'"
                  }
                }
              }
            }
          }
        }
      }
      "x-lambda-functions": {
        "my-function-1": {
          "runtime": "nodejs6.10",
          "handler": "index.handler",
          "memory": "128",
          "path_to_code": "./function1"
        }
      }
    }

Notice that the above example has omitted the Lambda-specific properties in the integration object, such as *uri*. Handel will still create and wire the Lambdas for you.

HTTP Passthrough Swagger Extensions
***********************************
In addition to servicing your API methods with Lambdas, you can configure API Gateway to just do an HTTP passthrough to some other HTTP endpoint, be it an AWS EC2 server or something else outside of AWS entirely.

Handel supports this with another swagger extension, called *x-http-passthrough-url* that you configure on your resource methods. Here's an example:

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
            "x-http-passthrough-url": "https://my.cool.fake.url.com"
          }
        }
      }
    }

The above Swagger document will route GET on the "/" path to "https://my.cool.fake.url.com". All request headers, parameters, and body will be passed through directly to the given URL, and the response from the URL will be passed through API Gateway without modification.

If you need to use path params with the HTTP passthrough, you can use the *x-http-passthrough-path-params* Swagger extension to map the path parameters from the API Gateway request to the HTTP backend request. Here's an example Swagger document doing this:

.. code-block:: json

    {
      "swagger": "2.0",
      "info": {
        "title": "my-cool-app",
        "description": "Test Swagger API",
        "version:": "1.0"
      },
      "paths": {
        "/user/{name}": {
          "get": {
            "responses": {
              "200": {}
            },
            "x-http-passthrough-url": "https://my.cool.fake.url.com/{person}",
            "x-http-passthrough-path-params": {
              "name": "person"
            }
          }
        }
      }
    }

The above example shows mapping the "name" path parameter in the API Gateway request to the "person" path parameter in the backend request.

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
            runtime: nodejs6.10
            handler: index.handler
            memory: 256
            timeout: 5
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
