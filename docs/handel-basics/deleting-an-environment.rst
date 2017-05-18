.. _deleting-an-environment:

Deleting an Environment
=======================
Once you've created an application using Handel, you may decide to delete one or more of your environments. This document tells how to delete your environments.

.. DANGER::

    If you delete an environment, it will delete all data in your environment! 
    
    Please review the data in an environment carefully before deleting it. You are responsible fo
    
To delete an environment, do the following:

Execute Handel's delete lifecycle, passing in the environment you want to delete:

.. code-block:: bash

    # Note that you need to also pass in the account config file
    handel delete -c ~/projects/byu/handel-account-configs/prd-swat-oit-byu.yml -e dev

When you execute that command, Handel will show you a big warning message like the following:

.. code-block:: none

    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    WARNING: YOU ARE ABOUT TO DELETE YOUR HANDEL ENVIRONMENT 'dev'!
    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    If you choose to delete this environment, you will lose all data stored in the environment!

    In particular, you will lose all data in the following:

    * Databases
    * Caches
    * S3 Buckets
    * EFS Mounts

    PLEASE REVIEW this environment thoroughly, as you are responsible for all data loss associated with an accidental deletion.
    PLEASE BACKUP your data sources before deleting this environment just to be safe.

    ? Enter 'yes' to delete your environment. Handel will refuse to delete the environment with any other answer:

Type 'yes' at the prompt to delete the environment. Handel will then proceed to delete the environment.
