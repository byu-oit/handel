# AWS Deploy Design
This document contains information about the architecture of AWS Deploy

# Service Deployments
Services are deployed from a declarative specification file. This file specifies the
way for each service to be deployed, as well as how they depend on each other. This
dependency information provides information to wire together the services.

# Service Deployment Ordering
Services are deployed in parallel wherever possible. Some services in your deployment 
specification depend on other services, so those must be deployed serially.

The aws-deploy library orders service dependencies into levels that are deployed in parallel.
The first level deployed contains dependencies for the next level to be deployed, and so on.

# Service Deployer Contract
Each service is deployed by a package of code that knows how to update that service. In the simplest form,
the service deployer is implemented by a single JS module file. The public interface of each deployer must
implement the following contract:
```
//Checks the service spec from the deploy file to verify parameter correctness
//Takes a JS object containing the service parameters
//Returns a JS array of 0 or more string error messages
check(serviceContext)

//Create resources that other services need in order to bind to this one
preDeploy(serviceContext)

bind(serviceContext, )

//Deploys the service. Must take care of both initial provisioning and updates (if applicable)
//Takes a JS object containing the service parameters, and a list of JS objects that contain dependent service contexts
//Returns a JS object containing the required service integration outputs
deploy(serviceContext, dependenciesServiceContexts)
```

# Service Integration Outputs 
Each service must return a JS object containing outputs from the service creation/update:
```
{
  policies: [], //Policies the consuming service can use when creating service roles in order to talk to this service
  credentials: [], //Items intended to be made securely available to the consuming service (via a secure S3 location)
  outputs: [] //Items intended to be injected as environment variables into the consuming service
}
```