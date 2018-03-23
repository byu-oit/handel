.. _codedeploy:

CodeDeploy
==========
This document contains information about the `CodeDeploy <https://aws.amazon.com/codedeploy/>`__ service supported in Handel. This Handel service provisions an autoscaling group running CodeDeploy. 
You can install arbitrary software on these instances using CodeDeploy's `appspec.yml <https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file.html>`_ file.

.. IMPORTANT::

    CodeDeploy is far less managed than other compute services like Lambda, ECS Fargate, and Elastic Beanstalk. 
    You are responsible for all configuration on the EC2 instances. Please see the 
    `CodeDeploy Documentation <https://docs.aws.amazon.com/codedeploy/latest/userguide/welcome.html>`_ 
    for details on this service, 

Service Limitations
-------------------

No Windows Support
~~~~~~~~~~~~~~~~~~
This service currently doesn't allow you to provision Windows instances to use with CodeDeploy.

No Single Instance Support
~~~~~~~~~~~~~~~~~~~~~~~~~~
This service doesn't support using CodeDeploy in a single-instance configuration. It only supports using auto-scaling groups, although you can use an 
auto-scaling group with a min/max of 1, which gets you a single instance.

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
     - This must always be *codedeploy* for this service type.
   * - path_to_code
     - string
     - Yes
     - 
     - The location of the directory you want to upload to CodeDeploy. You must have your *appspec.yml* file at the root of this directory!
   * - os
     - string
     - Yes
     - 
     - The type of OS to use with CodeDeploy. Currently the only supported value is *linux*.
   * - instance_type
     - string
     - No
     - t2.micro
     - The EC2 instance type on which your application will run.
   * - key_name
     - string
     - No
     - None
     - The name of the EC2 keypair to use for SSH access to the instances.
   * - auto_scaling
     - :ref:`codedeploy-auto-scaling`
     - No
     - 
     - The configuration to use for scaling up and down
   * - routing
     - :ref:`codedeploy-routing`
     - No
     - 
     - The Routing element details what kind of routing you want to your CodeDeploy service (if any)
   * - environment_variables
     - :ref:`codedeploy-environment-variables`
     - No
     - 
     - Any user-specified environment variables to inject in the application.
   * - tags
     - :ref:`tagging-resources`
     - No
     - 
     - Any tags you want to apply to your CodeDeploy resources.

.. _codedeploy-auto-scaling:

AutoScaling
~~~~~~~~~~~
The `auto_scaling` section is defined by the following schema:

.. code-block:: yaml

    auto_scaling: # Optional
      min_instances: <integer> # Optional. Default: 1
      max_instances: <integer> # Optional. Default: 1
      scaling_policies: # Optional
      - type: <up|down>
        adjustment:
          type: <string> # Optional. Default: 'ChangeInCapacity'.
          value: <number> # Required
          cooldown: <number> # Optional. Default: 300. 
        alarm:
          namespace: <string> # Optional. Default: 'AWS/EC2'
          dimensions: # Optional. Default: Your auto-scaling group dimensions.
            <string>: <string>
          metric_name: <string> # Required
          statistic: <string> # Optional. Default: 'Average'
          comparison_operator: <string> # Required
          threshold: <number> # Required
          period: <number> # Optional. Default: 300
          evaluation_periods: <number> # Optional. Default: 5

.. TIP::

  Auto-scaling in AWS is based off the CloudWatch service. Configuring auto-scaling can be a bit daunting at first if you haven't used CloudWatch metrics or alarms. 
  
  See the below :ref:`codedeploy-example-handel-files` section for some examples of configuring auto-scaling.

.. _codedeploy-environment-variables:

EnvironmentVariables
~~~~~~~~~~~~~~~~~~~~
The EnvironmentVariables element is defined by the following schema:

.. code-block:: yaml

    environment_variables:
      <YOUR_ENV_NAME>: <your_env_value>

<YOUR_ENV_NAME> is a string that will be the name of the injected environment variable. <your_env_value> is its value. You may specify an arbitrary number of environment variables in this section.

.. _codedeploy-routing:

Routing
~~~~~~~
The Routing element is defined by the following schema:

.. code-block:: yaml
    
    routing:
      type: <http|https>
      https_certificate: <string> # Required if you select https as the routing type
      dns_names:
       - <string> # Optional

The `dns_names` section creates one or more dns names that point to this load balancer. See :ref:`route53zone-records` for more.

.. _codedeploy-example-handel-files:

Example Handel Files
--------------------

Simple CodeDeploy Service
~~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows the simplest possible CodeDeploy service. It doesn't have a load balancer to route requests to it, and it doesn't use auto-scaling.

.. code-block:: yaml

    version: 1

    name: codedeploy-example

    environments:
      dev:
        webapp:
          type: codedeploy
          path_to_code: .
          os: linux

CodeDeploy With Load Balancer
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows a CodeDeploy service with a load balancer configured in front of it:

.. code-block:: yaml

    version: 1

    name: codedeploy-example

    environments:
      dev:
        webapp:
          type: codedeploy
          path_to_code: .
          os: linux
          routing:
            type: https
            https_certificate: your-certificate-id-here
            dns_names: # Optional
            - mydnsname.myfakedomain.com

CodeDeploy With Auto-Scaling
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows a CodeDeploy service with a load balancer and auto scaling policies configured:

.. code-block:: yaml

    version: 1

    name: codedeploy-test

    environments:
      dev:
        webapp:
          type: codedeploy
          path_to_code: .
          os: linux
          auto_scaling:
            min_instances: 1
            max_instances: 4
            scaling_policies:
            - type: up
              adjustment:
                value: 1
                cooldown: 60
              alarm:
                metric_name: CPUUtilization
                comparison_operator: GreaterThanThreshold
                threshold: 70
                period: 60
            - type: down
              adjustment:
                value: 1
                cooldown: 60
              alarm:
                metric_name: CPUUtilization
                comparison_operator: LessThanThreshold
                threshold: 30
                period: 60
          routing:
            type: https
            https_certificate: your-certificate-id-here
            dns_names:
            - mydnsname.myfakedomain.com


Depending on this service
-------------------------
The CodeDeploy service cannot be referenced as a dependency for another Handel service.

Events produced by this service
-------------------------------
The CodeDeploy service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The CodeDeploy service does not consume events from other Handel services.
