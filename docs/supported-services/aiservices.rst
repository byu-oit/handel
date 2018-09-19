.. _aiservices:

AI Services
===========
This document contains information about the AI Services provisioner supported in Handel. This Handel service allows you to access to services such as Rekognition in your application.

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

* :ref:`rekognition <aiservices-rekognition>`
* :ref:`polly <aiservices-polly>`

.. _aiservices-rekognition:

Rekognition
-----------
Collection Restrictions
~~~~~~~~~~~~~~~~~~~~~~~
Rekognition calls can be broken up into two general categories:

* Those dealing with individual images
* Those dealing with collections of persisted images

The individual image operations are stateless: In order to get the same results you must have the same image. The **image collections are NOT stateless; they persist information** about images you have added to the collection previously. For example, if you create a collection and add an image to it, the faces from that image will be indexed. Future calls to the collection will be able to derive information about individuals from the stored information in the collection.

Because of this, Handel restricts your use of collections to those named with a particular prefix:

.. code-block:: none

    <appName>-<environmentName>
  
You may create, modify, and delete collections for any collections whose name starts with the above prefix. You may not use any other collections outside this namespace. This helps prevent other applcations in the same AWS account from accessing collections to which they are not authorized.

If you want to use objects from a S3 bucket, see :ref:`S3 Object Access <aiservices-S3-Object-Access>`

.. _aiservices-polly:

Polly
-----
Polly calls can be generated from text files to form audio files. Each language has multiple voices to choose from, which can be specified in your configuration. 

With 3000 or less characters, you can listen, download, or save immediately. For up to 100,000 characters your task must be saved to an S3 bucket.

Polly also restricts lexicon use to those with a particular prefix:

.. code-block:: none

    <appName>-<environmentName>
  
If you want to use objects from a S3 bucket, see :ref:`S3 Object Access <aiservices-S3-Object-Access>`

.. _aiservices-S3-Object-Access:

S3 Object Access
----------------
If you want to use objects from S3 rather than passing in bytes directly to the API calls, you must make sure your caller has permissions to the bucket.

.. IMPORTANT::
  Rekognition will use the permissions from the role of the *caller*, so your application will need to have permissions to the S3 bucket it is telling Rekognition to look in. 

Here is an example Handel file showing what is required to make this happen:

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
          - bucket # This is the important part
        aiaccess:
          type: aiservices
          ai_services:
          - rekognition
        bucket:
          type: s3

Notice that your API Gateway service in the above example needs to have a dependency on the *bucket* service. It can then tell Rekognition to look at objects
in that bucket, because it has access to the bucket.

Depending on this service
-------------------------
You can reference this service as a dependency in other services. It does not export any environment variables. Instead, it will just add a policy on the dependent service to allow access to the services you listed.

Events produced by this service
-------------------------------
The AI Services provisioner does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The AI Services provisioner does not consume events from other Handel services.