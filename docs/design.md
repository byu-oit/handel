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
Each service is deployed by a package of code that knows how to update that service. In the simplest form, the service deployer is implemented by a single JS module file. 

The public interface of each deployer must implement the following contract:
```
/**
 * Checks the given service for required parameters and correctness. This provides
 * a fail-fast mechanism for configuration errors before deploy is attempted.
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Array} - 0 or more String error messages
 */
function check(serviceContext)

/**
 * Create resources needed for deployment that are also needed for dependency wiring
 * with other services
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the pre-deploy
 */
preDeploy(serviceContext)

/**
 * Bind two resources from PreDeploy together by performing some wiring action on them. An example * is to add an ingress rule from one security group onto another. Wiring actions may also be
 * performed in the Deploy phase if there isn't a two-way linkage. For example, security groups
 * probably need to be done in PreDeploy and Bind, but environment variables from one service to
 * another can just be done in Deploy
 *
 * Bind is run from the perspective of the service being consumed, not the other way around.
 *
 * Do not use this phase for creating resources. Those should be done either in PreDeploy or Deploy.
 * This phase is for wiring up existing resources from PreDeploy
 *
 * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being consumed
 * @param {PreDeployContext} ownPreDeployContext - The PreDeployContext of the service being consumed
 * @param {ServiceContext} dependentOfServiceContext - The ServiceContext of the service consuming this one
 * @param {PreDeployContext} dependentOfPreDeployContext - The PreDeployContext of the service consuming this one
 * @returns {Promise.<BindContext>} - A Promise of the BindContext results from the Bind
 */
bind(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)

/**
 * Deploy the given resource, wiring it up with results from the DeployContexts of services
 * that this one depends on. All dependencies are guaranteed to be deployed before the ones
 * consuming them
 *
 * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being deployed
 * @param {PreDeployContext} ownPreDeployContext - The PreDeployContext of the service being deployed
 * @param {Array<DeployContext>} dependenciesDeployContexts - The DeployContexts of the services that this one depends on
 * @returns {Promise.<DeployContext>} - A Promise of the DeployContext from this deploy
 */
deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
```

See the section below for information on the object types from the parameters in the contract.

# Service Deployer Interfaces
The following object types are defined as part of the service contract:

### ServiceContext
A ServiceContext provides the following contract:
```
{
  appName: <app element from deploy spec>,
  environmentName: <name of environment from deploy spec that this service belongs to>,
  serviceName: <name of service from deploy spec that this ServiceContext represents>,
  serviceType: <type of service being deployed (efs, s3, etc.)>,
  params: { } //Arbitrary list of key-value parameters (may be nested)
}
```

### PreDeployContext
A PreDeployContext provides the following contract:
```
{
  serviceName: <name of service that this DeployContext represents>,
  serviceType: <type of service this DeployContext represents (efs, s3, etc.)>,
  securityGroups: [ 
    <security group for this resource>
  ]
}
```

### BindContext
A BindContext provides the following contract:
```
{
  ???
}
```

### DeployContext
A DeployContext provides the following contract:
```
{
  serviceName: <name of service that this DeployContext represents>,
  serviceType: <type of service this DeployContext represents (efs, s3, etc.)>,
  policies: [], //Policies the consuming service can use when creating service roles in order to talk to this service
  credentials: [], //Items intended to be made securely available to the consuming service (via a secure S3 location)
  outputs: [] //Items intended to be injected as environment variables into the consuming service
}
```

# Account Config File
As part of the parameters to aws-deploy, you must provide a YAML file containing account-level information about the account in which you wish to deploy. It currently is of the following format:
```
region: <aws region>
vpc_id: <id for vpc in which to deploy compute resources>
public_subnets:
- <id for subnets in which to deploy public resources>
private_subnets:
- <id for subnets in which to deploy private resources>
data_subnets:
- <id for subnets in which to deploy data resources>
```