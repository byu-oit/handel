.. _postgresql:

PostgreSQL (RDS)
================
This page contains information about using the PostgreSQL service in Handel. This service provides a PostgreSQL database via the RDS service.

Service Limitations
-------------------

No Option Group Support
~~~~~~~~~~~~~~~~~~~~~~~
This service doesn't allow you to specify any custom options in an option group. It does allow you specify custom parameters in a parameter group, however.

No Update Support
~~~~~~~~~~~~~~~~~
This service intentionally does not support updates. Once a database is created, certain updates to the database will cause a new database to be created and the old one deleted. In an effort to avoid unwanted data loss, we don't update this service automatically. You can still modify the database and parameter group manually in the AWS console.

.. WARNING::

    Make sure you know what you're doing when you modify your RDS database in the AWS Console. Certain actions will cause database downtime, and some may even cause the database to be recreated.

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
     - This must always be *postgresql* for this service type.
   * - database_name
     - string
     - yes
     - 
     - The name of your database in your PostgreSQL instance.
   * - instance_type
     - string
     - no
     - db.t2.micro
     - The size of database instance to run. See `DB Instance Class <http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.html>`_ for information on choosing an instance type.
   * - storage_gb:
     - number
     - no
     - 5
     - The number of Gigabytes (GB) of storage to allocate to your database.
   * - postgres_version:
     - string
     - no
     - 9.6.2
     - The version of PostgreSQL you wish to run. See `PostgreSQL on Amazon RDS <http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html>`_ for the list of supported versions.
   * - db_username
     - string
     - no
     - handel
     - The username for the user that will be created in your database. Your password will be automatically generated and securely stored in the EC2 Parameter Store for you to access.
   * - storage_type
     - string
     - no 
     - standard
     - The type of storage to use, whether magnetic or SSD. Allowed values: 'standard', 'gp2'.
   * - db_parameters
     - map<string, string>
     - no
     - 
     - A list of key/value PostgreSQL parameter group pairs to configure your database. You will need to look in the AWS Console to see the list of available parameters for PostgreSQL.
   * - tags
     - :ref:`postgresql-tags`
     - No
     - 
     - Any tags you wish to apply to this PostgreSQL instance.
     
.. WARNING::

    Be aware that large database instances are very expensive. The *db.cr1.8xl* instance type, for example, costs about $3,400/month. Make sure you check how much you will be paying!

    You can use the excellent `EC2Instances.info <http://www.ec2instances.info/rds/>`_ site to easily see pricing information for RDS databases.

.. _postgresql-tags:

Tags
~~~~
The Tags element is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>

.. NOTE::

    Handel automatically applies some tags for you. See :ref:`tagging-default-tags` for information about these tags.


Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: my-postgres-instance

    environments:
      dev:
        database:
          type: postgresql
          database_name: mydb
          instance_type: db.t2.micro
          storage_gb: 5
          postgres_version: 9.6.2
          db_username: mydb
          storage_type: standard
          db_parameters:
            authentication_timeout: 600
          tags:
            mytag: myvalue

Depending on this service
-------------------------
The PostgreSQL service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <ENV_PREFIX>_ADDRESS
     - The DNS name of the PostgreSQL database address.
   * - <ENV_PREFIX>_PORT
     - The port on which the PostgreSQL instance is listening.
   * - <ENV_PREFIX>_USERNAME
     - The username you can use to access the database.
   * - <ENV_PREFIX>_DATABASE_NAME
     - The name of the database in your PostgreSQL instance.

The <ENV_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See :ref:`environment-variable-prefix` for information about the structure of this prefix.

In addition, the PostgreSQL service puts the following credentials into the EC2 parameter store:

.. list-table::
   :header-rows: 1

   * - Parameter Name 
     - Description
   * - <parameter_prefix>.db_password
     - The password for your database user.

The <parameter_prefix> is a consistent prefix applied to all parameters injected by services in the EC2 Parameter Store. See :ref:`parameter-store-prefix` for information about the structure of this prefix.

Events produced by this service
-------------------------------
The PostgreSQL service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The PostgreSQL service does not consume events from other Handel services.