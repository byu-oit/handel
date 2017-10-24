.. _account-config-file:

Account Config File
===================
Handel requires two pieces of information in order to deploy your application:

* Your handel.yml file that contains your service specification
* Account configuration information that contains items like VPCs and subnets to use when deploying applications.

You can either choose to let Handel just use the AWS default VPC, or you can provide it with an Account Config File that contains the information about your own custom VPC to use.

.. IMPORTANT::

    If you're running Handel inside a company or organization AWS account, it is likely your company has already set up VPCs how they want them. In this case, get your platform/network group to help you configure this account config file for your VPC.


Using the AWS default VPC
-------------------------
If you're using Handel in a personal AWS account, it's likely that you don't want to have to set up a VPC and create your own account config file. In this case, Handel can just use the default VPC that AWS provides. You tell Handel to use these defaults in this way:

.. code-block:: none

    handel deploy -c default-us-east-1 -e dev

Notice that in the *-c* parameter, we are passing the string *default-us-east-1*, which tells Handel to use the default VPC in the us-east-1 region.

.. NOTE::

    To use a default VPC, specify it with the following pattern:
    
    .. code-block:: none

        default-<region>

    The <region> parameter is the name of the AWS region, such as *us-east-1* or *us-west-2*, where you want to run your app.

Using Handel at a company or organization
-----------------------------------------
It is best if someone with a knowledge of the account-level network configuration creates this account configuration file. This file can then be shared by all services that deploy in that account.

If you're using Handel in a company or organization account, talk to your platform/network group that administers the VPCs in your account. They can help you know what values to put in your account config file.

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
