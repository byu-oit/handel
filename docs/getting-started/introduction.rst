.. _introduction:

Introduction
============
Handel is a CLI tool that will help you more easily deploy your application 
to AWS. You specify a declarative file in your application called *handel.yml*, 
and Handel will deploy your application to AWS for you.

Handel runs on top of CloudFormation. It automatically creates CloudFormation
templates from your Handel file, and deploys your applications in a secure fashion,
providing a vastly easier experience than using vanilla CloudFormation.

Why does Handel exist?
----------------------
Handel runs on top of CloudFormation, so why not use CloudFormation directly?

The main answer is that using CloudFormation comes with a very steep learning curve.
The main difficulty comes not in learning the configuration language itself, but much
more in the interactions required between resources with IAM roles and EC2 security
groups.

By running on top of CloudFormation, Handel provides the following benefits:

- Automatic security wiring, freeing you from having to worry about EC2 security groups and IAM roles.
- Much simpler interface to configuring an application. A 400-line CloudFormation template can be configured in more like 30-40 lines. See :ref:`handel-vs-cloudformation` for an example of this.

By using Handel, you get to retain the benefits of CloudFormation with less work!

What AWS services are supported?
--------------------------------
See the :ref:`supported-services` section for information on which 
AWS services you can currently use with Handel.

How can I deploy an application with Handel?
--------------------------------------------
First, see the :ref:`installation` section to install Handel.

After you've installed Handel, see the :ref:`creating-your-first-handel-app` page 
for a tutorial on creating a simple app and deploying it with Handel.