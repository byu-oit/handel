.. _ecs:

ECS (Elastic Container Service)
===============================
This page contains information about the ECS service supported in Handel. This Handel service provisions your application code as an ECS Service, with included supporting infrastructure such as load balancers and auto-scaling groups.

Service Limitations
-------------------
One service per cluster
~~~~~~~~~~~~~~~~~~~~~~~
This service uses a model of one ECS service per ECS cluster. It does not support the model of one large cluster with multiple services running on it.

Auto-scaling support
~~~~~~~~~~~~~~~~~~~~
Auto-scaling up and down is not yet well-supported in this service.

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
   * - port_mappings
     - PortMappings
     - Yes
     - 
     - The PortMappings element details which ports to map onto the host from your container
   * - key_name
     - string
     - No
     - 
     - The name of the EC2 Keypair you wish to use for SSH access to the EC2 instances in your ECS cluster. If you don't specify this, you won't be able to SSH to your instances.
   * - max_mb
     - string
     - No
     - 128
     - How many megabytes (MB) of memory you wish to allocate for each container instance of your service. This will be used when calculating how many containers to fit on each host of the instance type you specify
   * - cpu_units
     - number
     - No
     - 100
     - The minimum number of CPU units you want to dedicate to the container.
   * - instance_type
     - string
     - No
     - t2.micro
     - The type of EC2 instance to use for your cluster. A larger instance will fit more task containers on each instance
   * - min_containers
     - number
     - No
     - 1
     - The minimum number of containers to run in the service.
   * - max_containers
     - number
     - No
     - 1
     - The maximum number of containers to run in the service.
   * - routing
     - Routing
     - No
     - 
     - The Routing element details what kind of routing you want to your ECS service (if any)
   * - environment_variables
     - EnvironmentVariables
     - No
     - 
     - The EnvironmentVariables element details environment variables you wish to be injected into your application
   * - tags
     - Tags
     - No
     - 
     - Any tags you want to apply to your Beanstalk environment

PortMappings element
~~~~~~~~~~~~~~~~~~~~
The PortMappings element is define by the following schema:

.. code-block:: yaml

    port_mappings:
    - <port_number>

<port_number> is a number value from 1 to 65335 detailing which port from the container should be exposed to the host. Since this is a YAML list, you can specify more than one port to map to the host if needed.

EnvironmentVariables element
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
The EnvironmentVariables element is defined by the following schema:

.. code-block:: yaml

    environment_variables:
      <YOUR_ENV_NAME>: <your_env_value>

<YOUR_ENV_NAME> is a string that will be the name of the injected environment variable. <your_env_value> is its value. You may specify an arbitrary number of environment variables in this section.

Routing element
~~~~~~~~~~~~~~~
The Routing element is defined by the following schema:

.. code-block:: yaml
    
    routing:
      type: <http|https>
      https_certificate # Required if you select https as the routing type

Tags element
~~~~~~~~~~~~
The Tags element is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>

Example Handel File
-------------------
This Handel file shows an ECS service being configured:

.. code-block:: yaml

    version: 1

    name: my-ecs-app

    environments:
      dev:
        webapp:
          type: ecs
          key_name: some_ssh_keypair
          max_mb: 256
          min_instances: 1
          max_instances: 1
          port_mappings:
          - 5000
          environment_variables:
            MY_TEST_ENV: my_test_value

Depending on this service
-------------------------
The ECS service cannot be referenced as a dependency for another Handel service

Events produced by this service
-------------------------------
The ECS service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The ECS service does not consume events from other Handel services.