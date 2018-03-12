.. _stepfunctions:

Step Functions
==============
This document contains information about the Step Functions service supported in Handel. This Handel service provisions Step Functions state machine resources to provide an application workflow.

Service Limitations
-------------------
No Activities
~~~~~~~~~~~~~
This service does not yet support Step Functions activity resources. Task resources are limited to Lambda functions.

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
     - This must always be *stepfunctions* for this service type.
   * - definition
     - :ref:`stepfunctions-definition`
     - Yes
     -
     - Path to file containing state machine definition.

.. _stepfunctions-definition:

State Machine Definition
~~~~~~~~~~~~~~~~~~~~~~~~
For the most part, the definition file you provide in the *definition* section is in `Amazon States Language <https://docs.aws.amazon.com/step-functions/latest/dg/concepts-amazon-states-language.html>`_. Instead of providing an ARN in the 'Resource' field of a state, however, one should give the service name from the Handel file. For convenience, Handel supports both JSON and YAML formats for the definition file, where pure States Language is based on JSON alone.

Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: my-state-machine

    environments:
      prd:
        foo:
          type: lambda
          path_to_code: foo/
          handler: lambda_function.lambda_handler
          runtime: python3.6
        bar:
          type: lambda
          path_to_code: bar/
          handler: lambda_function.lambda_handler
          runtime: python3.6
        machine:
          type: step_functions
          definition: state_machine.yml
          dependencies:
          - foo
          - bar

The previous Handel file defines a state machine that depends on two Lambda functions, named foo and bar. Its definition file, state_machine.yml, could look something like this:

.. code-block:: yaml

    StartAt: FooState
    States:
      FooState:
        Type: Task
        Resource: foo # Same as service name
        Next: BarState
      BarState:
        Type: Task
        Resource: bar # Same as service name
        End: true

Depending on this service
-------------------------
The Lambda service outputs the following environment variables:

.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <SERVICE_NAME>_STATE_MACHINE_NAME
     - The name of the created Step Functions state machine
   * - <SERVICE_NAME>_STATE_MACHINE_ARN
     - The ARN of the created Step Functions state machine

See :ref:`environment-variable-names` for information about how the service name is included in the environment variable name.

Events produced by this service
-------------------------------
The Step Functions service does not produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Step Functions service does not consume events from other Handel services.
