.. _accessing-secrets:

Accessing Application Secrets
=============================
Many applications have a need to securely store and access *secrets*. These secrets include things like database passwords, encryption keys, etc. This page contains information about how you can store and access these secrets in your application when using Handel.

.. WARNING::

    **Do not** pass these secrets into your application as environment variables in your Handel file. Since you commit your Handel file to source control, any credentials you put in there would be compromised. 
    
    Handel provides a different mechanism for passing secrets to your application, as explained in this document.

Application Secrets in Handel
-----------------------------
Handel uses the `EC2 Systems Manager Parameter Store <https://aws.amazon.com/ec2/systems-manager/parameter-store/>`_ for secrets storage. This service provides a key/value store where you can securely store secrets in a named parameter. You can then call the AWS API from your application to obtain these secrets.

Handel automatically wires up access to the Parameter Store in your applications, granting you access to get parameters whose names start with your application name from your Handel file.

Consider the following example Handel file, which defines a single Lambda:

.. code-block:: yaml

    version: 1

    name: my-lambda-app

    environments:
      dev:
        function:
          type: lambda
          path_to_code: .
          handler: app.handler
          runtime: nodejs6.10

This Lambda, when deployed, will be able to access any EC2 Parameter Store parameters that start with "my-lambda-app". Thus, the parameter ``my-lambda-app.somesecret`` would be available to this application, but the ``some-other-app.somesecret`` parameter would not, because it does not start with the application name in the Handel file.

Adding a Parameter to the Parameter Store
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
See the `Walkthrough <http://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-walk.html>`_ in the AWS documentation for an example of how to add your parameters.

.. IMPORTANT:: When you add your parameter, remember to start the name of the parameter with your application name from your Handel file.

Getting Parameters from the Parameter Store
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Once you've added a parameter to the Parameter Store with the proper prefix, your deployed application should be able to access it. See the example of CLI access for the get-parameters call in the `Walkthrough <http://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-walk.html>`_ for information on how to do this.

The example in the walkthrough shows an example using the CLI, but you can use the AWS language SDKs with the getParameters call in a similar manner. See the docuemntation of the SDK you are using for examples.