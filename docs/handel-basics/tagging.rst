.. _tagging:

Tagging
=======
Most AWS services support the `tagging of resources <https://aws.amazon.com/answers/account-management/aws-tagging-strategies/>`_. You can use tags to apply arbitrary metadata to AWS resources. This metadata is available with the resources, and can be used for a variety of purposes. Here are some examples of what you can use tags for:

* Generating cost-utilization reports.
* Providing information about teams developing the product such as contact information.
* Specifying which resources may be automatically shut down or terminated by an external script.

AWS services have limits on the total number of tags that may be applied to each service. As of January 2018, most services have a limit of `50 tags <https://aws.amazon.com/blogs/security/now-organize-your-aws-resources-by-using-up-to-50-tags-per-resource/>`_.

.. _tagging-application:

Application Tags
----------------

In your handel.yml file, you can specify tags that apply to all supported resources in the stack, as well as the underlying Cloudformation stacks.  You can specify these tags using a top-level 'tags' object:

.. code-block:: yaml

    version: 1

    name: <name of the app being deployed>

    tags:
      your-tag: value
      another-tag: another value
      technical-owner: Joe Developer <joe_developer@example.com>
      business-owner: Jill Manager <jill_manager@example.com>

    environments:
      ...

.. _tagging-resources:

Resource Tags
-------------

On resources that support it, Handel allows you to specify tags for that resource. It will make the appropriate calls on your behalf to tag the resources it creates with whatever tags you choose to apply.

Resource-level tags will override any application-level tags with the same name.

Resource-level tags are defined by the following schema:

.. code-block:: yaml

    environments:
      my-service:
        type: foo-service
        tags:
          yourtag: value
          another-tag: another value

.. _tagging-unsupported-resources:

Tagging Unsupported Resources
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. ATTENTION::

    Some AWS resource types do not support tagging. In these cases, any related, taggable resources will be tagged, as will the Cloudformation stack that Handel uses to provision the resources.

    If AWS adds tagging support to any of these services, the next Handel deploy should result in tags automatically being applied to the resources by Cloudformation.

    Example: ECS does not currently support tagging Task Definitions. Handel will, however, tag any Application Load Balancers that are provisioned to service that ECS configuration, as well as the Cloudformation stack that provisioned them.


.. _tagging-default-tags:

Default Tags
------------
In addition to the ones you specify yourself, Handel will automatically apply the following tags to your AWS resources:

* *app* - This will contain the value from the *name* field in your Handel file, which is the name of your overall application.
* *env* - This will contain the value of the *<environment_name>* that your service is a part of.

See :ref:`handel-file-explanation` for a refresher on where these automatically applied values fit in your Handel file.

.. _tagging-requiring-tags:

Requiring Tags
--------------

Some organizations may wish to enforce a specific resource tagging scheme. For example, in addition to Handel's `app` and `env` tags, they may wish to require that all resource have a `technical-owner` and `business-owner` tag.

Tag requirements can be configured in the :ref:`account-config-file`. If a user attempts to deploy an application that does not define the required tags either at the application level or the resource level, the deployment will fail.
