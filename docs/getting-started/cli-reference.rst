.. _cli-reference:

CLI Reference
=============

The Handel command-line interface should be run in a directory with a `handel.yml` file.

It defines three commands: `check`, `deploy`, and `delete`

.. _cli-check:

`handel check`
--------------

Validates that a given Handel configuration is valid.

Note that this does not validate against account-level settings, such as :ref:`tagging-requiring-tags`.

Parameters
~~~~~~~~~~

`handel check` does not accept parameters.

.. _cli-deploy:

`handel deploy`
---------------

Validates and deploys the resources in a given environment.

Parameters
~~~~~~~~~~

.. list-table::
   :header-rows: 1

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - -c <value>
     - string
     - Yes
     -
     - Path to account config or base64 encoded JSON string of config
   * - -e <env>[,<env>]
     - comma-separated list
     - Yes
     -
     - List of environments from the handelfile to deploy.
   * - -d
     - boolean (present or not present)
     - No
     - false
     - If set, turns on debug-level logging.
   * - -t <key>=<value>[,<key>=<value>]
     - comma-separated list of key-value pairs
     - No
     -
     - List of tags to apply to all resources in the handelfile. These override any static tags set in the handelfile.

.. _cli-delete:

`handel delete`
---------------

Deletes all resources in a given environment.

Parameters
~~~~~~~~~~

.. list-table::
   :header-rows: 1

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - -c <value>
     - string
     - Yes
     -
     - Path to account config or base64 encoded JSON string of config
   * - -e <env>[,<env>]
     - comma-separated list
     - Yes
     -
     - List of environments from the handelfile to delete.
   * - -d
     - boolean (present or not present)
     - No
     - false
     - If set, turns on debug-level logging.
   * - -y
     - boolean (present or not present)
     - No
     - false
     - If set, Handel will *not* prompt for confirmation of the delete action.

