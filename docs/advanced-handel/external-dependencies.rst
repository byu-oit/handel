.. _external-dependencies:

External Dependencies
=====================
Handel allows you to wire up :ref:`service-dependencies` inside your Handel file. In most cases, this works fine because your entire application often lives inside a single source code repository.

In some cases, however, you are writing an application that depends on services owned by another team. For example, many teams use SQS queues to communicate between internal applications. In this case, you often find yourself in situations where you want to depend on an SQS queue that lives in another Handel file in a different repository.

For these use cases, Handel supports specifying external service dependencies on these other services that you don't own.

.. WARNING::
   This process is more complicated than using regular internal dependencies. It is recommended to have your whole application live in a single repository when possible.

External Dependencies Format
----------------------------
In an application with dependencies in the same Handel file, the dependency information you provide is just the name of the service you wish to depend on:

.. code-block:: yaml
    
    ...
    environments:
      dev:
        webapp:
          type: beanstalk
          ...
          dependencies:
          - topic
        topic:
          type: sns
    ...

For external dependencies, you need to provide some more information that tells Handel exactly where the service can be located. The syntax for an external dependency is of the following form:

.. code-block:: yaml

   https://<your.domain>/<path_to>/handel.yml#appName=<handelAppName>&environmentName=<handelEnvironmentName>&serviceName=<handelServiceToConsume>

In the above syntax, you must provide a valid HTTPS link to your Handel file, and you must additionally tack on hash parameters to provide three pieces of information:

* The application name inside the Handel file you're referencing
* The environment name where the service you're referencing lives.
* The service name of the service in the environment you want to consume.

Handel uses this extra information to obtain information on the deployed service once it has obtained the external Handel file.

Dependencies Deploy Order
-------------------------
When you use external dependencies, Handel does not control the entire deployment lifecycle in a single pipeline, so it can't enforce exact ordering. When using external dependencies the burden is on you to do things in the correct order. 

When initially setting up external dependencies, you must do things in exactly the following order:

1. Deploy the external application that contains the service on which you want to depend.
2. Deploy the consuming application that will consume the external service. Do not add a dependency on the external service yet.
3. Add an explicit allow in the service dependency that allows it to be consumed externally. Re-deploy the external application.
4. Add an external dependency on the external service in the consuming application. Re-deploy the application.

After doing these four steps, your external dependency will be wired up correctly. See the section below for an example of adding an external service dependency.

External Service Dependency Example
-----------------------------------
This section shows an example of following the series of steps in the section above.

.. WARNING::
   You must follow these steps in the order specified! If you don't, things will likely not work correctly.

1. Deploy the external application
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
In this example, we have an SQS queue in an external service that our service will depend on.

.. code-block:: yaml

    version: 1

    name: external-dependency

    environments:
      dev:
        queue:
          type: sqs

2. Deploy the consuming application
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
In this example, we have a Beanstalk service that will depend on the external SQS queue.

.. code-block:: yaml

    version: 1

    name: my-app

    environments:
      dev:
        webapp:
          type: beanstalk
          path_to_code: .
          solution_stack: 64bit Amazon Linux 2016.09 v4.0.1 running Node.js

*Note that the above configuration does not yet add an external dependency. That must come later.* 

3. Add an explicit allow in the consumed service
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: yaml

    version: 1

    name: external-dependency

    environments:
      dev:
        queue:
          type: sqs
          external_dependent_services: # Explicit allow for other apps to consume me
          - https://raw.githubusercontent.com/byu-oit-appdev/myrepo/master/handel.yml#appName=my-app&environmentName=dev&serviceName=webapp

Note in the example above the *external_dependent_services* has been added.

4. Add an external dependency in the consuming service.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: yaml

    version: 1

    name: my-app

    environments:
      dev:
        webapp:
          type: beanstalk
          path_to_code: .
          solution_stack: 64bit Amazon Linux 2016.09 v4.0.1 running Node.js
          dependencies:
          - https://raw.githubusercontent.com/byu-oit-appdev/externalrepo/master/handel.yml#appName=external-dependency&environmentName=dev&serviceName=queue

Note in the example above the *dependencies* has been added with the external dependency.