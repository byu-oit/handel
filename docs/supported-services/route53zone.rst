.. _route53zone:

Route 53 Hosted Zone
====================
This document contains information about the Route 53 Hosted Zone service supported in Handel. This Handel service provisions a Route 53 Hosted Zone, in which you can create other DNS records.

Service Limitations
-------------------
The following Route 53 features are not currently supported in this service:

* Domain Name Registration - all public zones must be subdomains of byu.edu.

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
     - The DNS name for this hosted zone. If this is a public zone, it must end with .byu.edu.
   * - private
     - boolean
     - No
     - false
     - Whether or not this is a private zone. If it is a private zone, it is only accessible by the VPCs listed below
   * - vpcs
     - List<string>
     - No
     - [ <account> ]
     - List of VPC ids. Must only be specified if this is a private zone. The special value <account> references the VPC listed in the account configuration.
   * - tags
     - :ref:`route53zone-tags`
     - No
     -
     - Any tags you want to apply to your Lambda


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
          vpcs:
            - vpc-123456
            - <account>
          tags:
            mytag: mytagvalue

Depending on this service
-------------------------
This service outputs the following environment variables:


.. list-table::
   :header-rows: 1

   * - Environment Variable
     - Description
   * - <ENV_PREFIX>_DNS_NAME
     - The DNS name of hosted zone.
   * - <ENV_PREFIX>_NAME_SERVERS
     - A comma-delimited list of the name servers for this hosted zone. For example: ns1.example.com,ns2.example.co.uk


The <ENV_PREFIX> is a consistent prefix applied to all information injected for service dependencies.  See :ref:`environment-variable-prefix` for information about the structure of this prefix.


.. _route53zone-records:

DNS Records
~~~~~~~~~~~

Certain supported services can create an alias record in this zone.  The currently supported services are:

* Beanstalk
* ECS
* S3 Static Site (requires that the bucket be named with the corresponding DNS name)

Beanstalk and ECS configurations will point at the load balancer that was created.  S3 static site configurations
will point at the S3 bucket itself.

The DNS configuration for each of these services is the same. Multiple DNS configurations may be specified.

.. list-table::
   :header-rows: 1

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - name
     - string
     - Yes
     -
     - The DNS name to assign.
   * - protocols
     - List<string>
     - No
     - [ ipv4, ipv6 ]
     - The IP protocols for which to create records. The only valid values are 'ipv4' and 'ipv6', which will recreate 'A' and 'AAAA' records.
   * - comment
     - string
     - No
     - Handel-created alias
     - Description of this zone
   * - tags
     - :ref:`route53zone-tags`
     - No
     -
     - Any tags you want to apply to your DNS record

The DNS must either match or be a subdomain of an existing Route 53 hosted zone name. If the hosted zone is configured
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
          ...
          dns:
            - name: beanstalk.myapp.byu.edu
          dependencies:
            - dns
        ecs-app:
          type: ecs
          ...
          dns:
            - name: ecs.myapp.byu.edu
              protocols: [ ipv6 ] #no ipv4 support - don't do this!
            - name: ecs.internal.myapp
              protocols: [ ipv4 ]
              comment: Private Service Discovery DNS
              tags:
                mytag: myvalue
          dependencies:
            - dns
            - private-dns
        s3site:
          type: s3staticsite
          bucket_name: mysite.byu.edu # must match the public dns name assigned to it
          ...
          dns:
            - name: mysite.byu.edu # This requires that a hosted zone for mysite.byu.edu have already been configured.



Events produced by this service
-------------------------------
The Route 53 Hosted Zone service does not currently produce events for other Handel services to consume.

Events consumed by this service
-------------------------------
The Route 53 Hosted Zone service does not currently consume events from other Handle services.
