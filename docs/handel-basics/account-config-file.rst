.. _account-config-file:

Account Config File
===================
Handel requires two pieces of information in order to deploy your application:

* Your handel.yml file that contains your service specification
* An account configuration YAML file that contains account-level information for things such as VPCs, subnets, etc.

The account configuration file contains the low-level information that can be shared by all Handel apps deploying to a single account. This file is a bit more tricky to build than your Handel file, as it requires some knowledge of the network topology of your account.

It is best if someone with a knowledge of the account-level network configuration creates this account configuration file. This file can then be shared by all services that deploy in that account.

Account Config File Specification
---------------------------------
The account config file is a YAML file that must contain the following information:

.. code-block:: yaml

  account_id: <number> # Required. The numeric ID of your AWS account
  region: <string> # Required. The region, such as 'us-west-2' that your VPC resides in.
  vpc: <string> # Required. The ID of your VPC in which to deploy your applications.
  public_subnets: # Required. A list of one or more subnet IDs from your VPC where you want to deploy publicly available resources.
  - <string>
  private_subnets: # Required. A list of one or more subnet IDs from your VPC where you want to deploy private resources.
  - <string>
  data_subnets: # Required. A list of one or more subnet IDs from your VPC where you want to deploy databases (such as RDS and ElastiCache)
  - <string>
  ssh_bastion_sg: <string> # The ID of the security group you
  elasticache_subnet_group: <string> # The name of the ElastiCache subnet group to use when deploying ElastiCache clusters.
  rds_subnet_group: <string> # The name of the RDS subnet group to use when deploying RDS clusters.

.. NOTE::

    If you're using the default VPC in your account, it doesn't have separate public, private, and data subnets. In this case, just use the same subnet IDs in each of the subnet sections in the account config file.

Defining Your Account Config File
---------------------------------
If you're using your own personal account and just want to use the default VPC that AWS gives you, use the `Handel-Quickstart <http://handel-quickstart.readthedocs.io>`_ tool to help you automatically configure the account config file.

If you're using Handel in a company or organization account, talk to your platform/network group that administers the VPCs in your account. They can help you know what values to put in your account config file.
