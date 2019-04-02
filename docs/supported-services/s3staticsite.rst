.. _s3staticsite:

S3 Static Site
==============
This document contains information about the S3 Static Site service supported in Handel. This Handel service sets up an S3 bucket and CloudFront distribution for your static website.

.. ATTENTION::

    This service requires you to have the external AWS CLI installed in order to use it. See the `AWS documentation <https://aws.amazon.com/cli/>`_ for help on installing it.

    If you are running Handel inside CodePipeline, you should already have the AWS CLI pre-installed.

Service Limitations
-------------------

No CORS Support
~~~~~~~~~~~~~~~
This service doesn't support configuring CORS support on the static site bucket. It just uses the default CORS configuration for S3 buckets:

* Origin: *
* Methods: GET
* Headers: Authorization

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
   * - cloudfront
     - :ref:`s3staticsite-cloudfront`
     - No
     -
     - Configuration for CloudFront. If not specified, CloudFront is not enabled.
   * - tags
     - :ref:`tagging-resources`
     - No
     -
     - Any tags you want to apply to your S3 bucket

.. _s3staticsite-cloudfront:

CloudFront Configuration
~~~~~~~~~~~~~~~~~~~~~~~~

.. NOTE::

    ACM https certificate must be in us-east-1. See this `AWS support article <https://aws.amazon.com/premiumsupport/knowledge-center/install-ssl-cloudfront/>`_ for more information.

The `cloudfront` section is defined by the following schema:

.. list-table::
   :header-rows: 1

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - https_certificate
     - string
     - No
     -
     - The ID of an Amazon Certificate Manager certificate to use for this site.
   * - minimum_https_protocol
     - string
     - No
     - 'TLSv1.2_2018'
     - The minimum allowed HTTPS protocol version. Valid values are listed in the `Cloudfront API Docs <https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_ViewerCertificate.html>`_.
   * - dns_names
     - List<string>
     - No
     -
     - The DNS names to use for the CloudFront distribution. See :ref:`route53zone-records`.
   * - price_class
     - string
     - No
     - all
     - one of `100`, `200`, or `all`. See `CloudFront Pricing <https://aws.amazon.com/cloudfront/pricing/>`_.
   * - logging
     - enabled|disabled
     - No
     - enabled
     - Whether or not to log all calls to Cloudfront.
   * - min_ttl
     - :ref:`s3staticsite-cloudfront-ttl`
     - No
     - 0
     - Minimum time to cache objects in CloudFront
   * - max_ttl
     - :ref:`s3staticsite-cloudfront-ttl`
     - No
     - 1 year
     - Maximum time to cache objects in CloudFront
   * - default_ttl
     - :ref:`s3staticsite-cloudfront-ttl`
     - No
     - 1 day
     - Default time to cache objects in CloudFront


.. _s3staticsite-cloudfront-ttl:

TTL Values
``````````

`min_ttl`, `max_ttl`, and `default_ttl` control how often CloudFront will check the
source bucket for updated objects. They are specified in seconds.
In the interest of readability, Handel also offers some duration shortcuts:

.. list-table::
   :header-rows: 1

   * - Alias
     - Duration in seconds
   * - second(s)
     - 1
   * - minute(s)
     - 60
   * - hour(s)
     - 3600
   * - day(s)
     - 86400
   * - year
     - 31536000

So, writing this:


.. code-block:: yaml

    cloudfront_max_ttl: 2 days

is equivalent to:

.. code-block:: yaml

    cloudfront_max_ttl: 172800

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
          cdn:
            price_class: all
            https_certificate: 6afbc85f-de0c-4ee9-b7d7-28b961eca135
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