.. _beanstalk:

Beanstalk
=========
This document contains information about the Beanstalk service supported in Handel. This Handel service provisions an Elastic Beanstalk application, which consists of an auto-scaling group fronted by an Elastic Load Balancer.

Service Limitations
-------------------

No Docker Support
~~~~~~~~~~~~~~~~~
This Handel Beanstalk service does not yet support Docker stack types. Support is planned to be added in the near future.

Parameters
----------

.. list-table:: 
   :header-rows: 1
   
   * - Parameter
     - Type
     - Required
     - Default
     - Description
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
   * - environment_variables
     - EnvironmentVariables
     - No
     - 
     - Any user-specified environment variables to inject in the application.
   * - tags
     - Tags
     - No
     - 
     - Any tags you want to apply to your Beanstalk environment

EnvironmentVariables element
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
The EnvironmentVariables element is defined by the following schema:

.. code-block:: yaml

    environment_variables:
      <YOUR_ENV_NAME>: <your_env_value>

<YOUR_ENV_NAME> is a string that will be the name of the injected environment variable. <your_env_value> is its value. You may specify an arbitrary number of environment variables in this section.

Tags element
~~~~~~~~~~~~
The Tags element is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>

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
The Beanstalk service cannot be referenced as a dependency for another Handel service

Events produced by this service
-------------------------------
The Beanstalk service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Beanstalk service does not consume events from other Handel services.