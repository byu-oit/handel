.. _using-extensions:

Using Extensions
================
Handel provides an API for writing extensions to provide additional service types other than the official service types provided by Handel. Organizations can use this to implement service types that are highly customized to their particular use cases. These custom service types can retain the same ease-of-configuration and automatic service wiring that Handel provides.

.. DANGER::

    **Extensions are inherently dangerous!**
    
    Handel needs to run with administrator permissions, so **extensions can potentially harm your account** in many ways. Handel cannot validate what an extension is doing, so by using an extension you are running untrusted code. 
    
    **DO NOT** run an extension unless you trust the source and have validated what actions it performs.

Using an Extension
------------------
Once you've found an extension that you want to use, you'll need to specify the extension to be loaded in your Handel file. You can then use the service types that extension provides.

In this section, we'll use the `sns-handel-extension <https://www.npmjs.com/package/sns-handel-extension>`_ as an example. Handel already ships with an SNS service type, so this extension is really only useful as an example of how to consume extensions.

Load the Extension
~~~~~~~~~~~~~~~~~~
To use an extension, first configure it to be loaded in your Handel file:

.. code-block:: yaml

    version: 1
    
    name: sns-ext-example
    
    extensions:
      sns: sns-handel-extension

The `extensions` section contains an object of one or more extensions you want Handel to load when you execute the project. The key is a short name that you can choose. You will use this short name when referencing the extension's service types. The value is the name of the NPM package containing the Handel extension.

.. IMPORTANT::

    Since extensions are defined in your Handel file, that means they will only be loaded for that project and not globally for all projects. 
    
    If you have another project that is using Handel, you can use the same extension by configuring the `extensions` section in that Handel file to load the extension as well.

Use Extension Service Types
~~~~~~~~~~~~~~~~~~~~~~~~~~~
Once you have loaded the extensions that you'll be using, you can reference the service types contained in them:

.. code-block:: yaml

    version: 1
    
    name: sns-ext-example
    
    extensions:
      sns: sns-handel-extension

    environments:
      dev:
        task:
          type: sns::sns

Note from the example above that when using extension services you must use the syntax `<extensionName>::<serviceType>`. In the above case we named our extension *sns* and the service type we are using in that extension is also called *sns*, which is why the resulting type you specify is *sns::sns*

.. NOTE::

    You can know what service types an extension contains, as well as how to configure each service type, by looking at the documentation provided by the extension.
