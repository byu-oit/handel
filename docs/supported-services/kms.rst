.. _kms:

KMS (Key Management Service)
============================
This document contains information about the KMS service supported in Handel. This Handel service provisions a KMS key and alias for use by your applications.

Service Limitations
-------------------
This service currently does not allow creating disabled keys. It also uses IAM instead of custom Key Policies to control
access to the key, as key policies can easily make keys unmanageable.

While the AWS API allows for multiple aliases to point to a single key, this service matches the AWS Console in enforcing
a one-to-one relationship between keys.

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
     - This must always be *kms* for this service type.
   * - alias
     - string
     - No
     - <appName>/<environmentName>/<serviceName>
     - The name of the alias to create. This name must be unique across the account and region in which the key is deployed.
   * - auto_rotate
     - boolean
     - No
     - true
     - Whether to allow AWS to auto-rotate the underlying Master Key.

Example Handel File
-------------------
This Handel file shows a KMS key being configured:

.. code-block:: yaml

    version: 1

    name: my-app

    environments:
      dev:
        mykey:
          type: kms
          # because we don't specify an alias, the alias will be my-app/dev/mykey (see above)
          auto_rotate: true

Depending on this service
-------------------------
This service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <ENV_PREFIX>_KEY_ID
     - The id of the created key
   * - <ENV_PREFIX>_KEY_ARN
     - The ARN of the created key
   * - <ENV_PREFIX>_ALIAS_NAME
     - The name of the created alias
   * - <ENV_PREFIX>_ALIAS_ARN
     - The ARN of the created alias

The <ENV_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See :ref:`environment-variable-prefix` for information about the structure of this prefix.

Events produced by this service
-------------------------------
The KMS service does not currently produce events for other Handel services. Support for producing events upon key rotation is planned for the future.

Events consumed by this service
-------------------------------
The KMS service does not consume events from other Handel services.