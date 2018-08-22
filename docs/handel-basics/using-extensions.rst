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

Specifying an Extension Version
-------------------------------
By default, Handel will grab the latest version of the specified extension from NPM. If you wish to specify a version or range of versions, you can use the syntax from the `package.json spec <https://docs.npmjs.com/files/package.json#dependencies>`_:


.. code-block:: yaml

    version: 1

    name: sns-ext-example

    extensions:
      sns: sns-handel-extension@^0.1.0

    environments:
      dev:
        task:
          type: sns::sns

This will cause Handel to fetch the latest 0.1.x version of the sns-handel-extension. For more about how these rules work, see the documentation on `NPM's implementation of semantic versioning <https://docs.npmjs.com/misc/semver>`_

Local Extensions
----------------
You may find yourself wanting to implement something that Handel doesn't support, but isn't widely reusable. While it is usually best to contribute an extension to the wider Handel ecosystem, there are cases where that is not appropriate.

Handel leverages `NPM's support for local paths <https://docs.npmjs.com/files/package.json#local-paths>`_  allows you to create 'local extensions' - extensions which live inside of your project.

You'll need to follow the guide to :ref:`writing-extensions`, and put your extension source code in a subdirectory of your project: we recommend inside of a directory called `.local-handel-extensions`, but you can name it anything you like.

Let's say you've implemented an extension in `.local-handel-extensions/fancy-extension`. You can now use it like this:

.. code-block:: yaml

    version: 1

    name: local-extension-example

    extensions:
      fancy: file:.local-handel-extensions/fancy-extension

    environments:
      dev:
        fancy:
          type: fancy:superfancy

.. NOTE::

    Handel will ensure that all production dependencies listed in your local extension's `package.json` are installed, but will not perform any build steps for you (like transpiling from Typescript).

    You will need to ensure that any such build steps are carried out before running `handel`.


Other Extension Sources
-----------------------

Handel also supports installing extensions from GitHub, GitLab, Bitbucket, and Git repositories.

The values for these sources must be prefixed by their type ("`github:`", "`gitlab:`", "`bitbucket:`", "`git:`") and follow
the format specified in the `npm install <https://docs.npmjs.com/cli/install>`_ documentation.

.. code-block:: yaml

    version: 1

    name: local-extension-example

    extensions:
      my-github-extension:     github:myorg/myrepo#my-optional-branch-specifier
      my-bitbucket-extension:  bitbucket:myuser/myrepo
      my-gitlab-extension:     gitlab:myorg/myrepo
      my-git-extension:        git:git+https://my-server.com/my-repo.git

