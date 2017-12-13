.. _ecs-fargate:

ECS Fargate
===========
This page contains information about the ECS Fargate service supported in Handel. This Handel service provisions your application code as an ECS Fargate Service, with included supporting infrastructure such as load balancers and service auto-scaling groups.

.. WARNING::

    Support for ECS Fargate is currently in beta. Most things should work properly, but you may encounter bugs. If you do, please submit a `GitHub Issue <https://github.com/byu-oit/handel/issues>`_

Service Limitations
-------------------
No EFS Support
~~~~~~~~~~~~~~
Right now you can't consume EFS services as dependencies in this service.

Unsupported ECS task features
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This service currently does not support the following ECS task features:

* User-specified volumes from the EC2 host. You can specify services such as EFS that will mount a volume in your container for you, however.
* Extra networking items such as manually specifying DNS Servers, DNS Search Domains, and extra hosts in the /etc/hosts file
* Task definition options such as specifying an entry point, command, or working directory. These options are available in your Dockerfile and can be specified there.

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
     - This must always be *ecs-fargate* for this service type.'
   * - max_mb
     - integer
     - No
     - 512
     - The max total MB for all containers in your service. Valid values can be found `here <https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ecs-taskdefinition.html#cfn-ecs-taskdefinition-memory>`_
   * - cpu_units
     - integer
     - No
     - 256
     - The max CPU units to use for all containers in your service. Valid values can be found `here <https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ecs-taskdefinition.html#cfn-ecs-taskdefinition-cpuhttps://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ecs-taskdefinition.html#cfn-ecs-taskdefinition-cpu>`_
   * - containers
     - :ref:`ecs-fargate-containers`
     - Yes
     - 
     - This section allows you to configure one or more containers that will make up your service.
   * - auto_scaling
     - :ref:`ecs-fargate-autoscaling`
     - Yes
     - 
     - This section contains information about scaling your tasks up and down.
   * - load_balancer
     - :ref:`ecs-fargate-loadbalancer`
     - No
     - 
     - If your task needs routing from a load balancer, this section can be used to configure the load balancer's options.
   * - log_retention_in_days
     - number
     - No
     - 30
     - Configures the log retention duration for CloudWatch logs.
   * - tags
     - :ref:`ecs-fargate-tags`
     - No
     - 
     - This section allows you to specify any tags you wish to apply to your ECS service.

.. _ecs-fargate-containers:

Containers
~~~~~~~~~~
The `containers` section is defined by the following schema:

.. code-block:: yaml

    containers:
    - name: <string> # Required
      image_name: <string> # Optional
      port_mappings: # Optional, required if you specify 'routing'
      - <integer>
      links: # Optional
      - <string> # Each value in the list should be the "name" field of another container in your containers list
      routing: # Optional
        base_path: <string> # Required
        health_check_path: <string> # Optional. Default: /
      environment_variables: # Optional
        <string>: <string>

.. NOTE::

  You may currently only specify the `routing` section in a single container. Attempting to add routing to multiple containers in a single service will result in an error. This is due to a current limitation in the integration between Application Load Balancers (ALB) and ECS that only allows you to attach an ALB to a single container in your task.

Container Image Names
*********************
In each container, you may specify an optional *image_name*. If you want to pull a public image from somewhere like DockerHub, just reference the image name:

.. code-block:: none

    dsw88/my-cool-image

If you want to reference an image in your AWS account's EC2 Container Registry (ECR), reference it like this:

.. code-block:: none

    # The <account> piece will be replaced with your account's long ECR repository name
    <account>/my-cool-image

If you don't specify an *image_name*, Handel will automatically choose an image name for you based on your Handel naming information. It will use the following image naming pattern:

.. code-block:: none

    <appName>-<serviceName>-<containerName>:<environmentName>

For example, if you don't specify an *image_name* in the below :ref:`ecs-example-handel-files`, the two images ECS looks for would be named the following:

.. code-block:: none

    my-ecs-app-webapp-mywebapp:dev
    my-ecs-app-webapp-myothercontainer:dev


.. _ecs-fargate-autoscaling:

AutoScaling
~~~~~~~~~~~
The `auto_scaling` section is defined by the following schema:

.. code-block:: yaml

    auto_scaling:
      min_tasks: <integer> # Required
      max_tasks: <integer> # Required
      scaling_policies: # Optional
      - type: <up|down>
        adjustment:
          type: <string> # Optional. Default: 'ChangeInCapacity'. See http://docs.aws.amazon.com/ApplicationAutoScaling/latest/APIReference/API_StepScalingPolicyConfiguration.html for allowed values
          value: <number> # Required
          cooldown: <number> # Optional. Default: 300. 
        alarm:
          namespace: <string> # Optional. Default: 'AWS/ECS'
          dimensions: # Optional. Default: Your ECS service dimensions
            <string>: <string>
          metric_name: <string> # Required
          comparison_operator: <string> # Required. See http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cw-alarm.html#cfn-cloudwatch-alarms-comparisonoperator for allowed values.
          threshold: <number> # Required
          period: <number> # Optional. Default: 300
          evaluation_periods: <number> # Optional. Default: 5


.. TIP::

  Auto-scaling in AWS is based off the CloudWatch service. Configuring auto-scaling can be a bit daunting at first if you haven't used CloudWatch metrics or alarms. 
  
  See the below :ref:`fargate-example-handel-files` section for some examples of configuring auto-scaling.

.. NOTE::

  If you don't wish to configure auto scaling for your containers, just set `min_tasks` = `max_tasks` and don't configure any *scaling_policies*.

.. _ecs-fargate-loadbalancer:

LoadBalancer
~~~~~~~~~~~~
The `load_balancer` section is defined by the following schema:

.. code-block:: yaml
    
    load_balancer:
      type: <string> # Required. Allowed values: `http`, `https`. 
      timeout: <integer> # Optional. The connection timeout on the load balancer
      https_certificate: <string> # Required if type=https. The ID of the ACM certificate to use on the load balancer.
      dns_names:
       - <string> # Optional.

The `dns_names` section creates one or more dns names that point to this load balancer. See :ref:`route53zone-records` for more.

.. _ecs-fargate-tags:

Tags
~~~~
The `tags` section is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>

.. NOTE::

    Handel automatically applies some tags for you. See :ref:`tagging-default-tags` for information about these tags.

.. _ecs-fargate-logging:

Logging
~~~~~~~
If logging is enabled, a CloudWatch log group will be created, with a name like fargate/<appName>-<environmentName>-<serviceName>.
Each container in the container configuration will have a log prefix matching its name. The retention time for the log
group is set with `log_retention_in_days`, and defaults to keeping the logs indefinitely.

.. _fargate-example-handel-files:

Example Handel Files
--------------------
Simplest Possible Fargate Service
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows an ECS service with only the required parameters:

.. code-block:: yaml

    version: 1

    name: my-fargate-app

    environments:
      dev:
        webapp:
          type: ecs-fargate
          auto_scaling:
            min_tasks: 1
            max_tasks: 1
          containers:
          - name: mywebapp

Web Service
~~~~~~~~~~~
This Handel file shows a Fargate service configured with HTTP routing to it via a load balancer:

.. code-block:: yaml

    version: 1

    name: my-fargate-app

    environments:
      dev:
        webapp:
          type: ecs-fargate
          auto_scaling:
            min_tasks: 1
            max_tasks: 1
          load_balancer:
            type: http
          containers:
          - name: mywebapp
            port_mappings:
            - 5000
            routing:
              base_path: /mypath
              health_check_path: /

Multiple Containers
~~~~~~~~~~~~~~~~~~~
This Handel file shows a Fargate service with two containers being configured:

.. code-block:: yaml

    version: 1

    name: my-fargate-app

    environments:
      dev:
        webapp:
          type: ecs-fargate
          auto_scaling:
            min_tasks: 1
            max_tasks: 1
          load_balancer:
            type: http
            timeout: 120
          tags:
            mytag: myvalue
          containers:
          - name: mywebapp
            port_mappings:
            - 5000
            environment_variables:
              MY_VAR: myvalue
            routing:
              base_path: /mypath
              health_check_path: /
          - name: myothercontainer

Auto-Scaling On Service CPU Utilization
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows a Fargate service auto-scaling on its own CPU Utilization metric. Note that in the *alarm* section you can leave off things like *namespace* and *dimensions* and it will default to your Fargate service for those values:

.. code-block:: yaml

    version: 1

    name: my-fargate-app

    environments:
      dev:
        webapp:
          type: ecs-fargate
          auto_scaling:
            min_tasks: 1
            max_tasks: 11
            scaling_policies:
            - type: up
              adjustment:
                value: 5
              alarm:
                metric_name: CPUUtilization
                comparison_operator: GreaterThanThreshold
                threshold: 70
            - type: down
              adjustment:
                value: 5
              alarm:
                metric_name: CPUUtilization
                comparison_operator: LessThanThreshold
                threshold: 30
          load_balancer:
            type: http
          containers:
          - name: fargatetest
            port_mappings:
            - 5000
            routing:
              base_path: /mypath

Auto-Scaling On Queue Size
~~~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows an ECS service scaling off the size of a queue it consumes:

.. code-block:: yaml

    version: 1

    name: my-fargate-app

    environments:
      dev:
        webapp:
          type: ecs-fargate
          auto_scaling:
            min_tasks: 1
            max_tasks: 11
            scaling_policies:
            - type: up
              adjustment:
                value: 5
              alarm:
                namespace: AWS/SQS
                dimensions:
                  QueueName: my-fargate-app-dev-queue-sqs
                metric_name: ApproximateNumberOfMessagesVisible
                comparison_operator: GreaterThanThreshold
                threshold: 2000
            - type: down
              adjustment:
                value: 5
              alarm:
                namespace: AWS/SQS
                dimensions:
                  QueueName: my-fargate-app-dev-queue-sqs
                metric_name: ApproximateNumberOfMessagesVisible
                comparison_operator: LessThanThreshold
                threshold: 100
          load_balancer:
            type: http
          containers:
          - name: fargatetest
            port_mappings:
            - 5000
            routing:
              base_path: /mypath
          dependencies:
          - queue
        queue:
          type: sqs

        
Depending on this service
-------------------------
The ECS Fargate service cannot be referenced as a dependency for another Handel service

Events produced by this service
-------------------------------
The ECS Fargate service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The ECS Fargate service does not consume events from other Handel services.
