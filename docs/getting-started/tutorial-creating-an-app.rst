.. _creating-your-first-handel-app:

Creating Your First Handel App
==============================
This page contains a tutorial for writing a simple Node.js "Hello World!" app and deploying it to AWS with the Handel tool.

.. IMPORTANT::

    Before going through this tutorial, make sure you have installed Handel on your machine as shown in the :ref:`installation` section.

Tutorial
--------
This tutorial contains the following steps:

1. Write the app
2. Create your Handel file
3. Deploy using Handel

Follow along with each of these steps in the sections below in order to complete the tutorial.

Write the app
~~~~~~~~~~~~~
We first need to create an app that you can run. We're going to use `Node.js <https://nodejs.org/en/>`_ to create an `Express <https://expressjs.com/>`_ web service that will run in `ElasticBeanstalk <https://aws.amazon.com/elasticbeanstalk/>`_. 

First create a directory for your application code:

.. code-block:: bash

    mkdir my-first-handel-app
    cd my-first-handel-app

Since it's a Node.js application, the first thing you'll need is a `package.json <https://docs.npmjs.com/files/package.json>`_ file that specifies information about your app, including its dependncies. Create a file named *package.json* with the following contents:

.. code-block:: json
   
    {
        "name": "my-first-handel-app",
        "version": "0.0.1",
        "author": "David Woodruff",
        "dependencies": {
            "express": "^4.15.2"
        }
    }

Now that you've got your package.json, install your dependencies from NPM:

.. code-block:: bash

    npm install

Next, create a file called *app.js* with the following contents:

.. code-block:: javascript

    var app = require('express')();

    app.get('/', function(req, res) {
        res.send("Hello World!");
    });

    var port = process.env.PORT || 3000;
    app.listen(port, function () {
        console.log('Server running at http://127.0.0.1:' + port + '/');
    });

.. NOTE::

    The above app code uses Express to set up a web server that has a single route "/". That route just responds with the string "Hello World!".

Test your app by starting it up:

.. code-block:: bash

    node app.js

Once it's started up, you should be able to go to `http://localhost:3000/ <http://localhost:3000>`_ to see it working. You should see a page that says "Hello World!" on it.

Create your Handel file
~~~~~~~~~~~~~~~~~~~~~~~
Now that you've got a working app, you need to create a Handel file specifying how you want your app deployed. Create a file called *handel.yml* with the following contents:

.. code-block:: yaml

    version: 1

    name: my-first-handel-app # This is a string you choose for the name of your app.

    environments:
      dev: # This is the name of your single environment you specify.
        webapp: # This is the name of your single service inside your 'dev' environment.
          type: beanstalk # Every Handel service requires a 'type' parameter
          path_to_code: . # This contains the path to the directory where your code lives that should be sent to Beanstalk
          solution_stack: 64bit Amazon Linux 2016.09 v4.0.1 running Node.js # This specifies which Beanstalk 'solution stack' should be used for the app.

.. NOTE::

    See the :ref:`handel-file` section for full details on how the Handel file is structured. 

.. NOTE::

    We only specified the required parameters for Beanstalk. There are others that have defaults if you don't specify them. See the :ref:`beanstalk` service documentation for full information on all the different parameters for the service.

Deploy using Handel
~~~~~~~~~~~~~~~~~~~
Now that you've written your app, created your Handel file, and obtained your account config file, you can run Handel to deploy:

.. code-block:: bash

    handel deploy -c default -e dev -v 1

In the above command, the following arguments are provided:

* The *-c* parameter specifies which :ref:`account-config-file` to use. Specifying "default" here tells Handel you don't have one and just want to use the default VPC AWS provides.
* The *-e* parameter is a comma-separated string list that specifies which environments from your Handel file you want to deploy
* The *-v* parameter is an arbitrary string specifying the current version being deployed.

.. IMPORTANT::

    The *-c* parameter in the *handel deploy* command above specifies which :ref:`account-config-file` you want to use. By specifying *default*, you're telling Handel you don't have a custom configured VPC and that it should just use the account defaults.

    If you're running Handel inside a company or organization AWS account, it is likely your company has already set up VPCs how they want them. In this case, get your platform/network group to help you configure this account config file for your VPC.

Once you've executed that command, Handel should start up and deploy your application. You can sign into the AWS Console and go to the "ElasticBeanstalk" service to see your deployed application.

Next Steps
----------
Now that you've deployed a simple app using Handel, where do you go next?

Learn more about Handel
~~~~~~~~~~~~~~~~~~~~~~~
Read through the following documents in the :ref:`handel-basics` section:

* :ref:`handel-file`
* :ref:`service-dependencies`
* :ref:`consuming-service-dependencies`
* :ref:`service-events`

Those documents will give you the information you need to get started using Handel. 

Learn how to configure the different service types
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
See the :ref:`supported-services` section, which contains information about the different services you can deploy using Handel. Each service page in that section will give the following information:

* Service features that aren't yet supported in Handel.
* Configuring the service in your Handel file
* How to consume the service in other services (if applicable).
* How to produce events to other services (if applicable).

Set up a continuous delivery pipeline
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Handel itself can run anywhere, but the best way to run Handel is inside a continuous delivery pipeline. AWS provides the CodePipeline service for continuous delivery pipelines. Handel provides a companion tool, called `Handel-CodePipeline <http://handel-codepipeline.readthedocs.io>`_, that helps you easily create these pipelines running Handel for your deploy.
