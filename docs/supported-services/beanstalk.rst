.. _beanstalk:

Beanstalk
=========
This document contains information about the Beanstalk service supported in Handel. This Handel service provisions an Elastic Beanstalk application, which consists of an auto-scaling group fronted by an Elastic Load Balancer.

Service Limitations
-------------------

No WAR support
~~~~~~~~~~~~~~~~~~~~~
This Handel Beanstalk service does not yet support Java WAR stack types. Support is planned to be added in the near future.

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
     - This must always be *beanstalk* for this service type.
   * - path_to_code
     - string
     - Yes
     - 
     - The location of your code to upload to Beanstalk. This can be a directory (which will be zipped up) or a single file (such as a deployable Java WAR file). If this points to a directory containing a Dockerrun.aws.json file or points to a Dockerrun.aws.json file then the following :ref:`dockerrun-tag` will be substituted.
   * - solution_stack
     - string
     - Yes
     - 
     - The ElasticBeanstalk solution stack you wish to use. This determines what AMI your application runs on. See `Elastic Beanstalk Supported Platforms <http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/concepts.platforms.html>`_ for the list of solution stacks.
   * - description
     - string
     - No
     - Application.
     - The description of the application.
   * - key_name
     - string
     - No
     - None
     - The name of the EC2 keypair to use for SSH access to the instance.
   * - auto_scaling
     - :ref:`beanstalk-auto-scaling`
     - No
     - 
     - The configuration to use for scaling up and down
   * - instance_type
     - string
     - No
     - t2.micro
     - The EC2 instance type on which your application will run.
   * - health_check_url
     - string
     - No
     - /
     - The URL the ELB should use to check the health of your application.
   * - routing
     - :ref:`beanstalk-routing`
     - No
     - 
     - The Routing element details what kind of routing you want to your ECS service (if any)
   * - environment_variables
     - :ref:`beanstalk-environment-variables`
     - No
     - 
     - Any user-specified environment variables to inject in the application.
   * - tags
     - :ref:`beanstalk-tags`
     - No
     - 
     - Any tags you want to apply to your Beanstalk environment

.. _dockerrun-tag:

Dockerrun.aws.json Replacement Tags
-----------------------------------

.. list-table::
   :header-rows: 1

   * - Tag
     - Description
   * - <aws_account_id>
     - The account_id from the account config file specified at deployment.
   * - <aws_region>
     - The region from the account config file specified at deployment.
   * - <handel_app_name>
     - The name of the Handel application
   * - <handel_environment_name>
     - The name of the Handel environment that the deployed service is contained in.
   * - <handel_service_name>
     - The name of the Handel service being deployed.

.. _beanstalk-auto-scaling:

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
          threshold: <number> # Required
          period: <number> # Optional. Default: 300
          evaluation_periods: <number> # Optional. Default: 5

.. TIP::

  Auto-scaling in AWS is based off the CloudWatch service. Configuring auto-scaling can be a bit daunting at first if you haven't used CloudWatch metrics or alarms. 
  
  See the below :ref:`beanstalk-example-handel-files` section for some examples of configuring auto-scaling.

.. _beanstalk-environment-variables:

EnvironmentVariables
~~~~~~~~~~~~~~~~~~~~
The EnvironmentVariables element is defined by the following schema:

.. code-block:: yaml

    environment_variables:
      <YOUR_ENV_NAME>: <your_env_value>

<YOUR_ENV_NAME> is a string that will be the name of the injected environment variable. <your_env_value> is its value. You may specify an arbitrary number of environment variables in this section.

.. _beanstalk-routing:

Routing
~~~~~~~
The Routing element is defined by the following schema:

.. code-block:: yaml
    
    routing:
      type: <http|https>
      https_certificate # Required if you select https as the routing type
      dns_names:
       - <string> # Optional

The `dns_names` section creates one or more dns names that point to this load balancer. See :ref:`route53zone-records` for more.

.. _beanstalk-tags:

Tags
~~~~
The Tags element is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>


.. ATTENTION::

  Beanstalk tags may not be modified after you initially create the environment. Beanstalk has had a feature request open for years to modify tags on environments, but still doesn't support it.

  If you try to modify your *tags* element after your environment is created, your CloudFormation stack will fail to update.

.. NOTE::

    Handel automatically applies some tags for you. See :ref:`tagging-default-tags` for information about these tags.

.. _beanstalk-example-handel-files:

Example Handel Files
--------------------

Simple Beanstalk Service
~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows a simply-configured Beanstalk service with most of the defaults intact:

.. code-block:: yaml

    version: 1

    name: my-beanstalk-app

    environments:
      dev:
        webapp:
          type: beanstalk
          path_to_code: .
          solution_stack: 64bit Amazon Linux 2016.09 v4.0.1 running Node.js
          environment_variables:
            MY_INJECTED_VAR: myValue
  
Auto-Scaling On Service CPU Utilization
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows a Beanstalk service auto-scaling on its own CPU Utilization metric. Note that in the *alarm* section you can leave off things like *namespace* and *dimensions* and it will default to your Beanstalk service for those values:

.. code-block:: yaml

    version: 1

    name: beanstalk-example

    environments:
      dev:
        webapp:
          type: beanstalk
          path_to_code: .
          solution_stack: 64bit Amazon Linux 2017.03 v4.1.0 running Node.js
          auto_scaling:
            min_instances: 1
            max_instances: 2
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

Auto-Scaling On Queue Size
~~~~~~~~~~~~~~~~~~~~~~~~~~
This Handel file shows a Beanstalk service scaling off the size of a queue it consumes:

.. code-block:: yaml

    version: 1

    name:  my-beanstalk-app

    environments:
      dev:
        webapp:
          type: beanstalk
          path_to_code: .
          solution_stack: 64bit Amazon Linux 2017.03 v4.1.0 running Node.js
          auto_scaling:
            min_instances: 1
            max_instances: 2
            scaling_policies:
            - type: up
              adjustment:
                value: 1
              alarm:
                namespace: AWS/SQS
                dimensions:
                  QueueName: my-beanstalk-app-dev-queue-sqs
                metric_name: ApproximateNumberOfMessagesVisible
                comparison_operator: GreaterThanThreshold
                threshold: 2000
            - type: down
              adjustment:
                value: 1
              alarm:
                namespace: AWS/SQS
                dimensions:
                  QueueName: my-beanstalk-appe-dev-queue-sqs
                metric_name: ApproximateNumberOfMessagesVisible
                comparison_operator: LessThanThreshold
                threshold: 100
          dependencies:
          - queue
        queue:
          type: sqs

Depending on this service
-------------------------
The Beanstalk service cannot be referenced as a dependency for another Handel service.

Events produced by this service
-------------------------------
The Beanstalk service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Beanstalk service does not consume events from other Handel services.
