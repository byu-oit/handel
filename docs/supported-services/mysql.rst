.. _mysql:

MySQL (RDS)
===========
This page contains information about using the MySQL service in Handel. This service provides a MySQL database via the RDS service.

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
     - This must always be *mysql* for this service type.
   * - database_name
     - string
     - Yes
     - 
     - The name of your database in your MySQL instance.
   * - description
     - string
     - No
     - Parameter group.
     - The parameter group description.
   * - instance_type
     - string
     - No
     - db.t2.micro
     - The size of database instance to run. See `DB Instance Class <http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.html>`_ for information on choosing an instance type.
   * - storage_gb:
     - number
     - No
     - 5
     - The number of Gigabytes (GB) of storage to allocate to your database.
   * - mysql_version:
     - string
     - No
     - 5.6.27
     - The version of MySQL you wish to run. See `MySQL on Amazon RDS <http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_MySQL.html>`_ for the list of supported versions.
   * - db_username
     - string
     - No
     - handel
     - The username for the user that will be created in your database. Your password will be automatically generated and securely stored in the EC2 Parameter Store for you to access.
   * - storage_type
     - string
     - No 
     - standard
     - The type of storage to use, whether magnetic or SSD. Allowed values: 'standard', 'gp2'.
   * - db_parameters
     - map<string, string>
     - No
     - 
     - A list of key/value MySQL parameter group pairs to configure your database. You will need to look in the AWS Console to see the list of available parameters for MySQL.
   * - tags
     - :ref:`mysql-tags`
     - No
     - 
     - Any tags you wish to apply to this MySQL instance.
     
.. WARNING::

    Be aware that large database instances are very expensive. The *db.cr1.8xl* instance type, for example, costs about $3,400/month. Make sure you check how much you will be paying!

    You can use the excellent `EC2Instances.info <http://www.ec2instances.info/rds/>`_ site to easily see pricing information for RDS databases.


.. _mysql-tags:

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

    name: my-mysql-instance

    environments:
      dev:
        database:
          type: mysql
          database_name: mydb
          instance_type: db.t2.micro
          storage_gb: 5
          mysql_version: 5.6.27
          db_username: mydb
          storage_type: standard
          db_parameters:
            autocommit: 1
          tags:
            mytag: myvalue

Depending on this service
-------------------------
The MySQL service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_ADDRESS
     - The DNS name of the MySQL database address.
   * - <SERVICE_NAME>_PORT
     - The port on which the MySQL instance is listening.
   * - <SERVICE_NAME>_USERNAME
     - The username you can use to access the database.
   * - <SERVICE_NAME>_DATABASE_NAME
     - The name of the database in your MySQL instance.

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

In addition, the MySQL service puts the following credentials into the EC2 parameter store:

.. list-table::
   :header-rows: 1

   * - Parameter Name 
     - Description
   * - <parameter_prefix>.db_password
     - The password for your database user.

The <parameter_prefix> is a consistent prefix applied to all parameters injected by services in the EC2 Parameter Store. See :ref:`parameter-store-prefix` for information about the structure of this prefix.

Events produced by this service
-------------------------------
The MySQL service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The MySQL service does not consume events from other Handel services.
