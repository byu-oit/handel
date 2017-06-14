.. _s3staticsite:

S3 Static Site
==============
This document contains information about the S3 Static Site service supported in Handel. This Handel service sets up an S3 bucket for your static website.

Service Limitations
-------------------

No CORS Support
~~~~~~~~~~~~~~~
This service doesn't yet support configuring CORS support on the static site bucket.

No Redirects Support
~~~~~~~~~~~~~~~~~~~~
This service doesn't yet support redirects (i.e. 'www.mysite.com' to 'mysite.com') to your static site bucket.

Parameters
----------
This service takes the following parameters:

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
     - This must always be *s3staticsite* for this service type.
   * - path_to_code
     - string
     - Yes
     - 
     - The path to the folder where your static website resides. This will be uploaded to your S3 static site bucket.
   * - bucket_name
     - string
     - No
     - <appName>-<environmentName>-<serviceName>-<serviceType>
     - The name of the bucket to create. This name must be globally unique across all AWS accounts, so 'myBucket' will likely be taken. :)
   * - versioning
     - string
     - No
     - disabled
     - Whether to enable versioning on the bucket. Allowed values: 'enabled', 'disabled'
   * - index_document
     - string
     - No
     - index.html
     - The name of the file in S3 to serve as the index document.
   * - error_document
     - string
     - No 
     - error.html
     - The name of the file in S3 to serve as the error document.
   * - tags
     - Tags
     - No
     -
     - Any tags you want to apply to your S3 bucket

Tags element
~~~~~~~~~~~~
The Tags element is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>

Example Handel File
-------------------
This Handel file shows an S3 Static Site service being configured:

.. code-block:: yaml

    version: 1

    name: s3-static-website

    environments:
      dev:
        site:
          type: s3staticsite
          path_to_code: ./_site/
          versioning: enabled
          index_document: index.html
          error_document: error.html
          tags:
            mytag: myvalue

Depending on this service
-------------------------
The S3 Static Site service cannot be referenced as a dependency for another Handel service.

Events produced by this service
-------------------------------
The S3 Static Site service does not produce events for other Handel services.

Events consumed by this service
-------------------------------
The S3 Static Site service does not consume events from other Handel services.