.. _handel-file:

Handel File
===========
In order to provide Handel with the information it needs to deploy your services, you must create a YAML configuration file for your application. This file must be named *handel.yml*. This page contains information on the structure of that file.

Handel File Specification
-------------------------
The Handel file is a YAML file that must conform to the following specification:

.. code-block:: yaml

    version: 1

    name: <name of the app being deployed>

    environments:
    <environment_name>:
      <service_name>:
        type: <service_type>
        <service_param>: <param_value>
        dependencies:
        - <service name>

Terminology
-----------
Handel uses the following terminology in the context of the Handel file:

Application
  In Handel, an 'application' is a logical container for of all the resources specified in your Handel file. This application is composed of one or more 'environments'.

Environment
  An 'environment' is a collection of one or more AWS services that form a single unit intended for use together. This construct allows you to have multiple instances of your application running in different configurations. 

  Many applications, for example, have a 'dev' environment for testing new changes, and a 'prod' environment for the actual production application that end-users hit. There are many other possible environments that an application may define.

  Each environment you specify constitutes a single instance of your application configured in a certain way.

Service
  In an environment, a 'service' is a single Handel service that is deployed via a CloudFormation stack. This service takes configuration parameters to determine how to deploy it. It can also reference other services in your environment that it depends on at runtime. Handel will auto-wire these services together for you and inject their information into your application. 

Handel File Explanation
-----------------------
name
  The name field is the top-level namespace for your application. This field is used in the naming of virtually all your AWS resources that Handel creates.

<environment_name>
  The <environment_name> key is a string you provide to specify the name of an environment. You can have multiple environments in your Handel application. This environment field is used in the naming of virtually all your AWS resources that Handel creates.

<service_name>
  The <environment_name> key is a string you provide to specify the name of a Handel service inside an environment. You can have multiple services in an environment. This service field is used in the naming of virtually all your AWS resources that Handel creates.

dependencies
  In a given Handel service, you can use the 'dependencies' field to specify other services in your environment with which your service needs to communicate.

  .. NOTE:: Not all AWS services can depend on all other AWS services. You will get an error if you try to depend on a service that is not consumable by your service.*

Limits
------
The following limits exist on names in the deploy spec:

.. list-table::
   :header-rows: 1
   
   * - Element
     - Length Limit
     - Allowed Characters
   * - name
     - 30 characters
     - Alphanumeric (a-Z, 0-9) and dashes (-)
   * - <environment_name>
     - 10 characters
     - Alphanumeric (a-Z, 0-9) and dashes (-)
   * - <service_name>
     - 20 characters
     - Alphanumeric (a-Z, 0-9) and dashes (-)

There may be other service-specific limits. See :ref:`supported-services` for information on service-specific limits.