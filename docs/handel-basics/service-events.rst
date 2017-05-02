Service Events
==============
Many AWS services are able to send *events* to other AWS services. For example, the S3 service can send events about file changes in a bucket to another service such as Lambda. 

Handel allows you to specify event consumers for a particular service in your Handel file. Handel will then perform the appropriate wiring on both services to configure the producer service to send events to the consumer service.

Specifying Service Events
-------------------------
To configure service events on a particular Handel service, add an 'event_consumers' list in your producer service definition. This list contains information about the services that will be consuming events from that producer service.

The following example shows an SNS topic specifying producing events to an SQS queue:

.. code-block:: yaml

    version: 1

    name: sns-events-example

    environments:
    dev:
        topic:
        type: sns
        event_consumers:
        - service_name: queue
        queue:
        type: sqs

When you specify event consumers in your producer service, you don't need to specify anything on the consumer services. They will be automatically wired appropriately to the producer service in which you specified them as consumers. 

.. NOTE::
   Not all services may produce events, and not all services may consume events. You will get an error if you try to specify a producer or consumer service that don't support events.

See [[External Handel Service Events]] if you need to produce or consume events from another application's Handel file.