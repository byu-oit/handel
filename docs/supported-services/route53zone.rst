.. _route53zone:

Route 53 Hosted Zone
====================
This document contains information about the Route 53 Hosted Zone service supported in Handel. This Handel service provisions a Route 53 Hosted Zone, in which you can create other DNS records.

Service Limitations
-------------------
The following Route 53 features are not currently supported in this service:

* Domain Name Registration

Manual Steps
------------
If creating a public zone as a subdomain of another domain (like myapp.byu.edu), you must register it with your DNS provider.

For BYU users, please refer to `this document <https://byuoit.atlassian.net/wiki/spaces/OAPP/pages/40075276/Routing+BYU+DNS+into+AWS>`_.

Parameters
----------
.. list-table::
   :header-rows: 1

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - type
     - string
     - Yes
     -
     - This must always be *route53zone* for this service type.
   * - name
     - string
     - Yes
     -
     - The DNS name for this hosted zone.
   * - private
     - boolean
     - No
     - false
     - Whether or not this is a private zone. If it is a private zone, it is only accessible by the VPC in your account config file.
   * - tags
     - :ref:`route53zone-tags`
     - No
     -
     - Any tags you want to apply to your Hosted Zone

.. _route53zone-tags:

Tags
~~~~
The Tags element is defined by the following schema:

.. code-block:: yaml

  tags:
   <your_tag_name>: <your_tag_value>

.. NOTE::

    Handel automatically applies some tags for you. See :ref:`tagging-default-tags` for information about these tags.

Example Handel File
-------------------

.. code-block:: yaml

    version: 1

    name: my-dns

    environments:
      dev:
        public-zone:
          type: route53zone
          name: mydomain.byu.edu
          tags:
            mytag: mytagvalue
        private-zone:
          type: route53zone
          name: private.myapp # Doesn't have to be a .byu.edu domain
          private: true
          tags:
            mytag: mytagvalue

Depending on this service
-------------------------
This service outputs the following environment variables:


.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <ENV_PREFIX>_ZONE_NAME
     - The DNS name of hosted zone.
   * - <ENV_PREFIX>_ZONE_ID
     - The id of the hosted zone
   * - <ENV_PREFIX>_ZONE_NAME_SERVERS
     - A comma-delimited list of the name servers for this hosted zone. For example: ns1.example.com,ns2.example.co.uk


The <ENV_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See :ref:`environment-variable-prefix` for information about the structure of this prefix.


.. _route53zone-records:

DNS Records
~~~~~~~~~~~

Certain supported services can create an alias record in this zone.  The currently supported services are:

* Beanstalk
* ECS

Each service can support multiple DNS entries. See the individual service documentation for how to define the DNS names.

The DNS name must either match or be a subdomain of an existing Route 53 hosted zone name. If the hosted zone is configured
in the same Handel environment, you must declare it as a dependency of the service consuming it.

.. code-block:: yaml

    version: 1

    name: my-app

    environments:
      dev:
        dns:
          type: route53zone
          name: myapp.byu.edu
        private-dns:
          type: route53zone
          name: internal.myapp
          private: true
        beanstalk-app:
          type: beanstalk
          routing:
            type: http
            dns_names:
              - beanstalk.mymapp.byu.edu
          ...
          dependencies:
            - dns
        ecs-app:
          type: ecs
          load_balancer:
            type: http
            dns_names:
              - ecs.myapp.byu.edu
              - ecs.internal.myapp
          ...
          dependencies:
            - dns
            - private-dns
        another-beanstalk:
          type: beanstalk
          routing:
            type: http
            dns_names:
              - mysite.byu.edu # This requires that a hosted zone for mysite.byu.edu have already been configured.
          ...


Events produced by this service
-------------------------------
The Route 53 Hosted Zone service does not currently produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Route 53 Hosted Zone service does not currently consume events from other Handle services.
