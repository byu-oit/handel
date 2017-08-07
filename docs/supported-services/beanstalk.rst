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
     - The location of your code to upload to Beanstalk. This can be a directory (which will be zipped up) or a single file (such as a deployable Java WAR file)
   * - solution_stack
     - string
     - Yes
     - 
     - The ElasticBeanstalk solution stack you wish to use. This determines what AMI your application runs on. See `Elastic Beanstalk Supported Platforms <http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/concepts.platforms.html>`_ for the list of solution stacks.
   * - description_template
     - string
     - No
     - Configuration template.
     - The description in the configuration template.
   * - description_version
     - string
     - No
     - Application version.
     - The description of the application version.
   * - key_name
     - string
     - No
     - None
     - The name of the EC2 keypair to use for SSH access to the instance.
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
   * - min_instances
     - number
     - No
     - 1
     - The minimum number of instances that can be in the auto-scale group.
   * - max_instances
     - number
     - No
     - 1
     - The maximum number of instances that can be in the auto-scale group.
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

Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: my-beanstalk-app

    environments:
      dev:
        webapp:
          type: beanstalk
          path_to_code: .
          solution_stack: 64bit Amazon Linux 2016.09 v4.0.1 running Node.js
          key_name: my-keypair-name
          instance_type: t2.micro
          health_check_url: /
          min_instances: 1
          max_instances: 1
          environment_variables:
            MY_INJECTED_VAR: myValue

Depending on this service
-------------------------
The Beanstalk service cannot be referenced as a dependency for another Handel service.

Events produced by this service
-------------------------------
The Beanstalk service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Beanstalk service does not consume events from other Handel services.
