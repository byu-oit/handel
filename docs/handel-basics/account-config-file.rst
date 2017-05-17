.. _account-config-file:

Account Config File
===================
Handel requires two pieces of information in order to deploy your application:

* Your handel.yml file that contains your service specification
* An account configuration YAML file that contains account-level information for things such as VPCs, subnets, etc.

The account configuration file contains the low-level information that can be shared by all Handel apps deploying to a single account. This file is a bit more tricky to build than your Handel file, as it requires some knowledge of the network topology of your account.

It is best if someone with a knowledge of the account-level network configuration creates this account configuration file. This file can then be shared by all services that deploy in that account.

Defining Your Own Account Config File
-------------------------------------
It's best if you can find someone with a good knowledge of VPCs to help define your account config file. If you don't have a person like that, see :ref:`creating-your-first-handel-app` for a tutorial on setting up prerequisite resources and specifying your own account config file.

Account Config File Specification
---------------------------------
The account config file is a YAML file that must contain the following information:

.. code-block:: yaml

  account_id: <aws account id>
  region: <aws region>
  vpc: <id for vpc in which to deploy compute resources>
  public_subnets:
  - <id for subnets in which to deploy public resources>
  private_subnets:
  - <id for subnets in which to deploy private resources>
  data_subnets:
  - <id for subnets in which to deploy data resources>
  ecs_ami: <AMI for the ECS agent>
  ssh_bastion_sg: <id for the SSH bastion security group>
  on_prem_cidr: <CIDR block for your on-prem resources>
