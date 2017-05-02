External Service Events
=======================
Handel allows you to wire up [service events](https://github.com/byu-oit-appdev/handel/wiki/Service-Events) inside your Handel file. When your services that produce and consume events all live in the same Handel file, Handel can easily provision and wire these services in the correct order.

In some cases, however, you are writing an application that consumes or produces events and depends on other services in another Handel file. For example, you may have another team that has an SNS topic and you want to subscribe to the topic to have a Lambda fire every time a post is made to that topic.

For these use cases, Handel supports specifying external service dependencies on these other services that you don't own.

.. WARNING::
   This process is more complicated than using regular internal service events. It is recommended to have your whole application live in a single repository when possible.

External Service Events Format
------------------------------
In an application with all services to produce and consume events in the same Handel file, the event wiring information you provide is just the name of the service you wish to produce events to:

.. code-block:: yaml

    ...
    environments:
      dev:
        function:
          type: lambda
          ...
        topic:
          type: sns
          event_consumers:
          - service_name: function
    ...

For external service events, you need to provide some more information that tells Handel exactly where the consumer service can be located. The syntax for an external event service name is of the following form:

..code-block:: none

    https://<your.domain>/<path_to>/handel.yml#appName=<handelAppName>&environmentName=<handelEnvironmentName>&serviceName=<handelServiceToConsume>

In the above syntax, you must provide a valid HTTPS link to your Handel file, and you must additionally tack on hash parameters to provide three pieces of information:

* The application name inside the Handel file you're referencing
* The environment name where the service you're referencing lives.
* The service name of the service in the environment you want to consume.

Handel uses this extra information to obtain information on the deployed service once it has obtained the external Handel file.

Service Events Deploy Order
---------------------------
When you use external service events, Handel does not control the entire deployment lifecycle in a single pipeline, so it can't enforce exact ordering. When using external service events, the burden is on your to do things in the correct order.

When initially setting up external service events, you must do things in exactly the following order:

1. Deploy the application that contains the consumer service.
2. Deploy the application that contains the producer service. Do not add any event consumers on the producer service yet.
3. Add an explicit allow in the consumer service that allows the producer application to produce events to it. Re-deploy the application
4. Add an event consumer on the producer service that produces to the consumer application. Re-deploy the application.

After doing these four steps, your external service events will be wired up correctly. See the section below for an example of adding external service events.

Specifying External Service Events
----------------------------------
To specify external service events, you must follow this exact order when initially setting up the external references:

1. Deploy the application that contains the consumer service
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: yaml

    version: 1

    name: myconsumer

    environments:
      dev:
        function:
          type: lambda
          path_to_code: .
          handler: index.handler
          runtime: nodejs6.10

2. Deploy the application that contains the producer service
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: yaml

    version: 1

    name: myproducer

    environments:
      dev:
        topic:
          type: topic

3. Add an explicit allow in the consumer service
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: yaml

    version: 1

    name: myconsumer

    environments:
      dev:
        function:
          type: lambda
          path_to_code: .
          handler: index.handler
          runtime: nodejs6.10
          external_event_producers: # Explicit allow for other apps to send events to me
          - https://raw.githubusercontent.com/byu-oit-appdev/producerrepo/master/handel.yml#appName=myproducer&environmentName=dev&serviceName=topic

Note that in the above example we've added the *external_event_producers*, which grants an explicit allow to the external producer service.

4. Add an event consumer on the producer service
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: yaml

    version: 1

    name: myproducer

    environments:
      dev:
        topic:
          type: topic
          event_consumers:
          - service_name: https://raw.githubusercontent.com/byu-oit-appdev/consumerrepo/master/handel.yml#appName=myconsumer&environmentName=dev&serviceName=function

Note that in the above example we've added the *event_consumers*, which sets up the topic to produce events to the consumer Lambda service.