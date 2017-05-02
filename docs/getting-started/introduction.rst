.. _introduction:

Introduction
============

Handel is a library that will help you deploy your application to AWS.
Configuring automated provisioning and deployment for your applications
in AWS can be very difficult and time-consuming. Handel takes care of
as many of the painful little details of your deployment as it can, 
so that you can focus on just configuring the services you want to use.

Why does Handel exist?
----------------------

An example will help illustrate the complexity of deploying AWS
applications: If you want to use the EC2 Container Service (ECS) to run
an application, you’ll need to configure several resources. You’d need
to provision and deploy at least the following resources:

-  ECS Cluster
-  Auto-Scaling Group
-  Launch Configuration
-  ECS Service
-  Application Load Balancer (ALB)
-  ALB Target Group
-  ALB Listener

Once you’ve got those services provisioned, you’ll need to wire them
together securely with IAM roles and EC2 security groups. Doing this
securely requires an in-depth knowledge of the IAM and VPC services.

After getting your ECS cluster running, you may decide you want to use
other AWS services in that application. For example, if you want to use
DynamoDB, you’ll have to do the following:

-  Figure out how to provision DynamoDB
-  Wire DynamoDB into your ECS service with IAM permissions.

Other services such as EFS will have different patterns of how to wire
it in to your ECS cluster, so you’ll have to learn those eventually too.

All these steps contribute to an extremely steep learning curve when you
want to go create a CloudFormation template that will securely deploy
your application and the services on which it depends.

How is Handel different than other deployment mechanisms?
---------------------------------------------------------

Handel is an abstraction on top of CloudFormation. It does not replace
CloudFormation, it actually uses CloudFormation under the hood to deploy
your applications.

Handel provides the following benefits over vanilla CloudFormation:

-  A much simpler interface to deploying an application. A 400-line
   CloudFormation template can be configured in more like 20-30 lines in
   a Handel file.
-  Services are securely wired together for you with EC2 security
   groups.
-  Services are securely wired together with IAM roles.
-  Your application is injected with environment variables at run-time.
   These environment variables provide information about the location
   and configuration of consumed AWS services.

What services are supported?
----------------------------

Handel does not support all AWS services. See the :ref:`supported-services`
section for information on which services you can use with Handel.

How can I deploy an application with Handel?
--------------------------------------------

See the :ref:`creating-a-handel-app` page for a tutorial
creating a simple app and deploying it with Handel.