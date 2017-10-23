.. _introduction:

Introduction
============
Handel is a CLI tool that will help you more easily deploy your application 
to AWS. You specify a declarative file in your application called *handel.yml*, 
and Handel will deploy your application to AWS for you.

Handel runs on top of CloudFormation. It automatically creates CloudFormation
templates from your Handel file, and deploys your applications in a secure fashion. 
It takes care of as many of the painful little details of your deployment as 
it can, so that you can focus on just configuring the details you actually care about.

Why does Handel exist?
----------------------
Handel runs on top of CloudFormation, so why not use CloudFormation directly?

CloudFormation is a great tool to provision and deploy applications in the AWS cloud, 
but it can be difficult and time-consuming to become proficient at using it. One
of the biggest difficulties in using CloudFormation is that you must become proficient
in wiring services together with IAM roles and EC2 security groups. This makes for
a steep learning curve when you want to deploy an application in AWS.

Handel takes some of this responsibility for you in order to ease the
work you have to do for your deployments. It takes over the process of
creating the multiple resources in CloudFormation, and securely wiring
these resources together.

In short, you get to retain the benefits of CloudFormation with less work!

What benefits does Handel provide over vanilla CloudFormation
-------------------------------------------------------------
.. IMPORTANT::

    *Handel is not a rewrite of CloudFormation.* Instead, Handel is an 
    abstraction on top of CloudFormation. It uses CloudFormation under the 
    hood to deploy your applications.

Handel provides the following benefits over using CloudFormation directly:

-  A much simpler interface to deploying an application. A 400-line
   CloudFormation template can be configured in more like 20-30 lines in
   a Handel file. See :ref:`handel-vs-cloudformation` for an example of
   this.
-  Services are securely wired together for you with EC2 security
   groups.
-  Services are securely wired together with IAM roles.

What AWS services are supported?
--------------------------------
See the :ref:`supported-services` section for information on which 
services you can use with Handel.

How can I deploy an application with Handel?
--------------------------------------------
First, see the :ref:`installation` section to install Handel.

After you've installed Handel, see the :ref:`creating-your-first-handel-app` page 
for a tutorial on creating a simple app and deploying it with Handel.