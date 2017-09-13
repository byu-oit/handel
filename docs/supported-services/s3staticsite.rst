.. _s3staticsite:

S3 Static Site
==============
This document contains information about the S3 Static Site service supported in Handel. This Handel service sets up an S3 bucket for your static website.

.. ATTENTION::

    This service requires you to have the external AWS CLI installed in order to use it. See the `AWS documentation <https://aws.amazon.com/cli/>`_ for help on installing it.

    If you are running Handel inside CodePipeline, you should already have the AWS CLI pre-installed.

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
   * - cdn
     - :ref:`s3staticsite-cdn`
     - No
     -
     - The configuration of the CloudFront CDN for this site.
   * - tags
     - :ref:`s3staticsite-tags`
     - No
     -
     - Any tags you want to apply to your S3 bucket


.. _s3staticsite-cdn:

CDN Configuration
~~~~~~~~~~~~~~~~~
The CloudFront CDN configuration is defined by the following schema:

.. code-block:: yaml

   cdn:
     price_class: <price class> #defaults to 100
     logging: <enabled|disabled> #defaults to enabled
     min_ttl: <ttl time> #defaults to 0
     max_ttl: <ttl time> #defaults to 1 year
     default_ttl: <ttl time> #defaults to 1 day
     https_certificate: <string> # Required to use HTTPs. The ID of the ACM certificate to use on the CloudFront distribution.
     dns_names: #Optional
       - <DNS Name>


.. _s3staticsite-cdn-price-class:

Price Classes
`````````````

Valid price class values are `100`, `200`, and `all`. For more information on what each value means, see
`CloudFront Pricing <https://aws.amazon.com/cloudfront/pricing/>`_


.. _s3staticsite-cdn-times:

TTL Values
``````````

`min_ttl`, `max_ttl`, and `default_ttl` control how often CloudFront will check the origin for updated objects.
They are specified in seconds. In the interest of readability, Handel also offers some duration shortcuts:

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

    max_ttl: 2 days

is equivalent to:

.. code-block:: yaml

    max_ttl: 172800

.. _s3staticsite-tags:

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