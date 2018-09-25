.. _writing-extensions:

Writing Extensions
==================
This page contains information on how to write a custom Handel extension. You can use extensions to provide your own customized service types that retain the same automatic dependency wiring as the built-in Handel services.

.. NOTE::
    If you're looking for information on how to use a custom extension that someone else wrote, see the :ref:`using-extensions` page.

Introduction
------------
Handel is written in TypeScript on the `Node.js <https://nodejs.org/en/>`_ platform. Therefore, implementing a Handel extension involves creating an `NPM <https://www.npmjs.com/>`_ package.

Writing your extensions in TypeScript is highly recommended since the objects dealt with in the AWS world can be very large and complex, and Handel passes a lot of information around between service provisioners.

Creating an Extension
---------------------
You can use the provided Yeoman generator to create a working extension skeleton with a single service. You can then use this skeleton to implement whatever you need in your extension.

First, install Yeoman and the generator:

.. code-block:: bash

    npm install -g yo
    npm install -g generator-handel-extension

Next, create a new directory and run the generator:

.. code-block:: bash

    mkdir test-handel-extension
    cd test-handel-extension
    yo handel-extension

Answer the questions the generator asks:

.. code-block:: none

    Welcome to the handel-extension generator!
    ? Extension name 
    ? Extension description
    ? Service type name

It will then create the output files in your directory:

.. code-block:: none

    Creating the initial files for the extension
      create package.json
    identical .gitignore
      create README.md
      create tsconfig.json
      create tslint.json
      create src/extension.ts
      create src/service.ts
      create test/fake-account-config.ts
      create test/service-test.ts

Building the Extension
~~~~~~~~~~~~~~~~~~~~~~
Now that you have your extension created, you can build it and run the unit tests:

.. code-block:: bash

    npm install
    npm run build
    npm test

All of these commands should work successfully on the initial extension skeleton code.

Testing the Extension
~~~~~~~~~~~~~~~~~~~~~
Once you have your extension skeleton created and built properly, you can write a Handel file and run Handel to test the extension locally.

First, link your extension package so it is findable by Handel:

.. code-block:: bash

    npm link

Next, create an example Handel file that will use your extension:

.. code-block:: bash

    mkdir example
    cd example
    vim handel.yml

You can use something like the following as the contents of the Handel file:

.. code-block:: yaml

    version: 1

    name: extension-test

    extensions:
      test: test-handel-extension # NPM package name is of format <extensionName>-handel-extensionj

    environments:
      dev:
        service:
          type: test::test # Service type that was specified is 'test'

The above handel file assumes that you chose `test` as your extension name and `test` as your service name when running the generator. If you specified something else you'll have to modify the contents of this file.

Finally, you can run Handel with the `--link-extensions` flag enabled to allow it to find your extension locally rather than from NPM:

.. code-block:: bash

    handel deploy -c default-us-west-2 -e dev --link-extensions

Extension Support Package
~~~~~~~~~~~~~~~~~~~~~~~~~
If you look at the `package.json` file that was generated for your extension, you'll notice that it includes the `handel-extension-support` package as a dependency. This package contains useful functions that you can use when implementing
the different phase types in your deployers. 

For example, it contains a methods to easily do things like the following:

* Create a security group in the preDeploy phase.
* Bind a security group to another with ingress rules
* Create and wait for a CloudFormation template

You should look at the methods offered by that package, because they will likely save you time and effort when implementing your extension. See the `package documentation <https://www.npmjs.com/package/handel-extension-support>`_ for those details.

Extension Contract
------------------
Each Handel extension must expose a consistent interface that Handel can use to load and provision the service deployers contained inside it.

The following TypeScript interface defines the contract for an extension:

.. code-block:: typescript

    export interface Extension {
        loadHandelExtension(context: ExtensionContext): void | Promise<void>;
    }

Your extension should use the passed-in ExtensionContext to add one or more service provisioners to it.

Service Provisioner Contract
----------------------------
A Handel extension is composed of one or more `dervice deployers`. Each service deployer must implement a particular contract consisting of one or more `phase types`. The Handel framework will invoke these implemented phase types at the appropriate time during deployment. Your job as an extension developer is to implement the phase types required for your service, and then Handel will take care of calling them at the right time and feeding them the correct data they need for deployment.

The following TypeScript interface defines the contract for a service deployer:

.. code-block:: typescript

    export interface ServiceDeployer {
        // ------------------------------------------------
        // Required metadata for the provisioner
        // ------------------------------------------------
        providedEventType: ServiceEventType | null; // The type of event type this deployer provides (if any)
        producedEventsSupportedTypes: ServiceEventType[]; // The types of event types that this deployer can produce to (if)
        producedDeployOutputTypes: DeployOutputType[]; // The types of deploy output types this deployer produces to other deployers
        consumedDeployOutputTypes: DeployOutputType[]; // The types of deploy output types this deployer can consume from other deployers
        supportsTagging: boolean; // If true, indicates that a deployer supports tagging its resources. This is used to enforce tagging rules.

        // ------------------------------------------------
        // Phase types that hte provisioner supports
        // ------------------------------------------------
        /**
        * Checks the given service configuration in the user's Handel file for required parameters and correctness.
        * This provides a fail-fast mechanism for configuration errors before deploy is attempted.
        *
        * You should probably always implement this phase in every service deployer
        */
        check?(serviceContext: ServiceContext<ServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[];

        /**
        * Create resources needed for deployment that are also needed for dependency wiring
        * with other services.
        *
        * Implement this phase if you'll be creating security groups for any of your resources
        *
        * Example AWS services that woulod need to implement this phase include Beanstalk and RDS
        */
        preDeploy?(serviceContext: ServiceContext<ServiceConfig>): Promise<PreDeployContext>;

        /**
        * Bind two resources from the preDeploy phase together by performing some wiring action on them. An example
        * is to add an ingress rule from one security group onto another.
        *
        * Bind is run from the perspective of the service being consumed, not the other way around. In other words, it
        * is run on the dependency who is adding the ingress rule for the dependent service.
        *
        * Implement this phase if you'll be creating resources that need to add ingress rules for dependent services
        * to talk to them
        *
        * Example AWS services that would need to implement this phase include RDS and EFS
        */
        bind?(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: IPreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: IPreDeployContext): Promise<IBindContext>;

        /**
        * Deploy the resources contained in your service deployer.
        *
        * You are responsible for using the outputs in the dependenciesDeployContexts to wire up this service
        * to those. For example, each one may return an IAM policiy that you should add to whatever role is
        * created for your service.
        *
        * All this service's dependencies are guaranteed to be deployed before this phase gets called
        */
        deploy?(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: IPreDeployContext, dependenciesDeployContexts: IDeployContext[]): Promise<IDeployContext>;

        /**
        * In this phase, this service should make any changes necessary to allow it to consume events from the given source
        * For example, a Lambda consuming events from an SNS topic should add a Lambda Function Permission to itself to allow
        * the SNS ARN to invoke it.
        *
        * This method will only be called if your service is listed as an event consumer in another service's configuration.
        */
        consumeEvents?(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: IDeployContext, eventConsumerConfig: ServiceEventConsumer, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: IDeployContext): Promise<IConsumeEventsContext>;

        /**
        * In this phase, this service should make any changes necessary to allow it to produce events to the consumer service.
        * For example, an S3 bucket producing events to a Lambda should add the event notifications to the S3 bucket for the
        * Lambda.
        *
        * This method will only be called if your service has an event_consumers element in its configruation.
        */
        produceEvents?(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: IDeployContext, eventConsumerConfig: ServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: IDeployContext): Promise<IProduceEventsContext>;

        /**
        * In this phase, the service should remove all resources created in the preDeploy phase.
        *
        * Implment this phase if you implemented the preDeploy phase!
        */
        unPreDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<IUnPreDeployContext>;

        /**
        * In this phase, the service should remove all bindings on preDeploy resources.
        */
        unBind?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<IUnBindContext>;

        /**
        * In this phase, the service should delete resources created during the deploy phase.
        *
        * Note that there are no 'unConsumeEvents' or 'unProduceEvents' phases. In most cases, deleting the
        * service will automatically delete any event bindings the service itself has, but in some cases this phase will
        * also need to manually remove event bindings. An example of this is CloudWatch Events, which requires that
        * you remove all targets before you can delete the service.
        */
        unDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<IUnDeployContext>;
    }

See the types in the `handel-extension-api` package for full details on the types passed as parameters to these phase type methods.

Handel Lifecycles
-----------------
The above service deployer contract gives information about the different `kinds` of phase types, but not `when` they are invoked by the Handel framework.

The Handel tool supports multiple `lifecycles`. There are currently three lifecycles:

* Deploy - Deploys an application from a Handel file
* Delete - Deletes an environment in a Handel file
* Check - Checks the Handel file for errors

Each of these lifecycles runs through a pre-defined series of `phases`. The following sections explain the phase orders used by each lifecycle.

Deploy Lifecycle
~~~~~~~~~~~~~~~~
The Deploy lifecycle executes the following phases in order:

1. Check
2. PreDeploy
3. Bind
4. Deploy
5. ConsumeEvents
6. ProduceEvents

Delete Lifecycle
~~~~~~~~~~~~~~~~
The Delete lifecycle executes the following phases in order:

1. UnDeploy
2. UnBind
3. UnPreDeploy

Check Lifecycle
~~~~~~~~~~~~~~~
The Check lifecycle executes the following phases in order:

1. Check