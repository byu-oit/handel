Service Dependencies
====================
One of the key features of Handel is being able to configure an AWS service such as Beanstalk to depend on another AWS service such as DynamoDB. Rather than having to figure out the security interactions between the two, Handel will auto-wire the services together for you. 

Specifying Dependencies
-----------------------
To specify a dependency on a service, add a 'dependencies' list in your service definition with the list values being the service names of the services you wish to consume. The following example shows a Beanstalk service specifying a dependency on an SQS queue:

.. code-block:: yaml

    version: 1

    name: beanstalk-example

    environments:
    dev:
        webapp:
        type: beanstalk
        path_to_code: .
        solution_stack: 64bit Amazon Linux 2016.09 v4.0.1 running Node.js
        instance_type: t2.micro
        health_check_url: /
        min_instances: 1
        max_instances: 1
        dependencies:
        - queue
        queue:
        type: sqs

Notice that the item in the dependencies list called 'queue' is referring to the service name specified for the SQS queue.

See [[Consuming Service Dependencies]] for information about how your consuming app (such as Beanstalk) can get the information it needs to talk to your service dependency (such as SQS).

See [[External Handel Dependencies]] for information on the details of external service events configuration.