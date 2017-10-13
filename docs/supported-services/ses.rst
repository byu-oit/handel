.. _ses:

SES (Simple Email Service)
=================================
This document contains information about the SES service supported in Handel. This Handel service verifies an email address for use by your applications.

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
     - This must always be *ses* for this service type.
   * - address
     - string
     - Yes
     -
     - The email address your applications will use.

.. NOTE::

    When Handel attempts to verify an email address through SES, AWS will send an email to the address with a link to verify the address. Handel will not attempt to re-verify email addresses that have already been verified in the same AWS account or are in a pending state (SES allows 24 hours before a verification fails). It will still wire up the appropriate permissions to allow other Handel services to use successfully verified addresses.

    Handel does not support verification of entire domains at this time.

.. WARNING::

    To allow multiple applications to share an email address, Handel does not delete an SES identity upon deletion of the Handel SES service.

Example Handel File
-------------------
This Handel file shows an SQS service being configured:

.. code-block:: yaml

    version: 1

    name: my-email-address

    environments:
      dev:
        email:
          type: ses
          address: user@example.com

Depending on this service
-------------------------
This service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_EMAIL_ADDRESS
     - The email address available through SES
   * - <SERVICE_NAME>_IDENTITY_ARN
     - The AWS ARN of the email identity

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The SES service does not currently produce events for other Handel services.

Events consumed by this service
-------------------------------
The SES service does not currently consume events from other Handel services.
