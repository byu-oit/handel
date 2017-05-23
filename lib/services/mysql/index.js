const winston = require('winston');
const ec2Calls = require('../../aws/ec2-calls');
const ssmCalls = require('../../aws/ssm-calls');
const handlebarsUtils = require('../../util/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../deployers-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const uuid = require('uuid');

const MYSQL_PORT = 3306;
const MYSQL_PROTOCOL = 'tcp';

function getDeployContext(serviceContext, cfStack) {
    let deployContext = new DeployContext(serviceContext);

    //Inject ENV variables to talk to this database
    let portEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'ADDRESS');
    let port = cloudFormationCalls.getOutput('DatabaseAddress', cfStack);
    deployContext.environmentVariables[portEnv] = port;
    let addressEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'PORT');
    let address = cloudFormationCalls.getOutput('DatabasePort', cfStack);
    deployContext.environmentVariables[addressEnv] = address;
    let usernameEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'USERNAME');
    let username = cloudFormationCalls.getOutput('DatabaseUsername', cfStack);
    deployContext.environmentVariables[usernameEnv] = username;
    let dbNameEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'DATABASE_NAME');
    let dbName = cloudFormationCalls.getOutput('DatabaseName', cfStack);
    deployContext.environmentVariables[dbNameEnv] = dbName;

    return deployContext;
}

function getParameterGroupFamily(mysqlVersion) {
    if(mysqlVersion.startsWith('5.5')) {
        return 'mysql5.5';
    }
    else if(mysqlVersion.startsWith('5.6')) {
        return 'mysql5.6';
    }
    else {
        return 'mysql5.7';
    }
}

function getCompiledMysqlTemplate(stackName, ownServiceContext, ownPreDeployContext) {
    let serviceParams = ownServiceContext.params;

    let dbSecurityGroupId = ownPreDeployContext['securityGroups'][0].GroupId;
    let instanceType = serviceParams.instance_type || 'db.t2.micro';
    let storageGB = serviceParams.storage_gb || 5;
    let databaseName = serviceParams.database_name;
    let dbSubnetGroup = accountConfig.rds_subnet_group;
    let mysqlVersion = serviceParams.mysql_version || '5.6.27';
    let dbUsername = serviceParams.db_username || 'handel';
    let storageType = serviceParams.storage_type || 'standard';

    let handlebarsParams = {
        storageGB,
        instanceType,
        stackName,
        databaseName,
        dbSubnetGroup,
        mysqlVersion,
        dbUsername,
        dbPort: MYSQL_PORT,
        storageType,
        dbSecurityGroupId,
        parameterGroupFamily: getParameterGroupFamily(mysqlVersion)
    };

    //Add parameters to parameter group if specified
    if(serviceParams.db_parameters) {
        handlebarsParams.parameterGroupParams = serviceParams.db_parameters;
    }

    //Set multiAZ if user-specified
    if (serviceParams.multi_az) {
        handlebarsParams.multi_az = true;
    }

    //Add tags (if present)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/mysql-template.yml`, handlebarsParams)
}

/**
 * Checks the given service for required parameters and correctness. This provides
 * a fail-fast mechanism for configuration errors before deploy is attempted.
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Array} - 0 or more String error messages
 */
exports.check = function (serviceContext) {
    let errors = [];
    let serviceParams = serviceContext.params;

    if(!serviceParams.database_name) {
        errors.push(`MySQL - The 'database_name' parameter is required`);
    }

    return errors;
}


/**
 * Create resources needed for deployment that are also needed for dependency wiring
 * with other services
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the pre-deploy
 */
exports.preDeploy = function (serviceContext) {
    let sgName = deployersCommon.getResourceName(serviceContext);
    winston.info(`MySQL - Executing PreDeploy on ${sgName}`);

    return deployersCommon.createSecurityGroupForService(sgName, 3306)
        .then(securityGroup => {
            winston.info(`MySQL - Finished PreDeploy on ${sgName}`);
            let preDeployContext = new PreDeployContext(serviceContext);
            preDeployContext.securityGroups.push(securityGroup);
            return preDeployContext;
        });
}


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
exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`MySQL - Executing Bind on ${stackName}`);
    let ownSg = ownPreDeployContext.securityGroups[0];
    let sourceSg = dependentOfPreDeployContext.securityGroups[0];

    return ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg,
        MYSQL_PROTOCOL, MYSQL_PORT,
        MYSQL_PORT, accountConfig['vpc'])
        .then(mysqlSecurityGroup => {
            winston.info(`MySQL - Finished Bind on ${stackName}`);
            return new BindContext(ownServiceContext, dependentOfServiceContext);
        });
}


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
exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`MySQL - Executing Deploy on ${stackName}`);

    return getCompiledMysqlTemplate(stackName, ownServiceContext, ownPreDeployContext)
        .then(compiledTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        let dbPassword = uuid().substring(0, 32);
                        let cfParameters = {
                            DBPassword: dbPassword
                        }
                        winston.info(`MySQL - Creating RDS instances '${stackName}'`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, cloudFormationCalls.getCfStyleStackParameters(cfParameters))
                            .then(deployedStack => {
                                //Add credential to EC2 Parameter Store
                                let credentialParamName = deployersCommon.getSsmParamName(ownServiceContext, "db_password");
                                return ssmCalls.storeParameter(credentialParamName, 'SecureString', dbPassword)
                                    .then(() => {
                                        return deployedStack;
                                    });
                            });
                    }
                    else {
                        winston.info(`MySQL - Updates are not supported for this service.`);
                        return stack;
                    }
                });
        })
        .then(deployedStack => {
            winston.info(`MySQL - Finished deploying RDS instance '${stackName}'`)
            return getDeployContext(ownServiceContext, deployedStack);
        });
}

/**
 * In this phase, this service should make any changes necessary to allow it to consume events from the given source
 * For example, a Lambda consuming events from an SNS topic should add a Lambda Function Permission to itself to allow
 * the SNS ARN to invoke it.
 * 
 * Some events like DynamoDB -> Lambda will do all the work in here because Lambda uses a polling model to 
 *   DynamoDB, so the DynamoDB service doesn't need to do any configuration itself. Most services will only do half
 *   the work here, however, to grant permissions to the producing service. 
 * 
 * This method will only be called if your service is listed as an event consumer in another service's configuration.
 * 
 * Throw an exception in this method if your service doesn't consume any events at all.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of this service consuming events
 * @param {DeployContext} ownDeployContext - The DeployContext of this service consuming events
 * @param {ServiceContext} producerServiceContext - The ServiceContext of the service that will be producing events for this service
 * @param {DeployContext} producerDeployContext - The DeployContext of the service that will be producing events for this service.
 * @returns {Promise.<ConsumeEventsContext>} - The information about the event consumption for this service
 */
exports.consumeEvents = function (ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The MySQL service doesn't consume events from other services"));
}

/**
 * In this phase, this service should make any changes necessary to allow it to produce events to the consumer service.
 * For example, an S3 bucket producing events to a Lambda should add the event notifications to the S3 bucket for the
 * Lambda.
 * 
 * Some events, like DynamoDB -> Lambda, won't do any work here to produce events, because Lambda uses a polling
 *   model. In cases like these, you can just return 
 * 
 * This method will only be called if your service has an event_consumers element in its configruation.
 * 
 * Throw an exception in this method if your service doesn't produce any events to any sources.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of this service producing events
 * @param {DeployContext} ownDeployContext - The DeployContext of this service producing events
 * @param {ServiceContext} producerServiceContext - The ServiceContext of the service that will be consuming events for this service
 * @param {DeployContext} producerDeployContext - The DeployContext of the service that will be consuming events for this service.
 * @returns {Promise.<ProduceEventsContext>} - The information about the event consumption for this service
 */
exports.produceEvents = function (ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The MySQL service doesn't produce events for other services"));
}

/**
 * This phase is part of the delete lifecycle. In this phase, the service should remove all resources created in PreDeploy.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being deleted.
 * @returns {Promise.<UnPreDeployContext>} - The UnPreDeployContext that represents the deletion of predeploy resources for this service
 */
exports.unPreDeploy = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`MySQL - Executing UnPreDeploy on ${sgName}`);

    return deployersCommon.deleteSecurityGroupForService(sgName)
        .then(success => {
            winston.info(`MySQL - Finished UnPreDeploy on ${sgName}`);
            return new UnPreDeployContext(ownServiceContext);
        });
}


/**
 * This phase is part of the delete lifecycle. In this phase, the service should remove all bindings on preDeploy resources.
 * 
 * Note that, unlike the Bind phase, this UnBind phase only takes a ServiceContext. Because the resource is being deleted, we
 * don't need to execute UnBind for each event binding combination. Instead, we can just remove all bindings simultaneously in
 * a single UnBind call.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of this service being deleted
 * @returns {Promise.<UnBindContext>} - The UnBindContext that represents the unbinding of this service.
 */
exports.unBind = function (ownServiceContext) {
    let sgName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`MySQL - Executing UnBind on ${sgName}`);

    return deployersCommon.unBindAllOnSg(sgName)
        .then(success => {
            winston.info(`MySQL - Finished UnBind on ${sgName}`);
            return new UnBindContext(ownServiceContext);
        });
}


/**
 * This phase is part of the delete lifecycle. In this phase, the service should delete itself.
 * 
 * Note that the delete lifecycle has no 'unConsumeEvents' or 'unProduceEvents'. In most cases, deleting the
 * service will automatically delete any event bindings the service itself has, but in some cases this phase will
 * also need to manually remove event bindings. An example of this is CloudWatch Events, which requires that
 * you remove all targets before you can delete the service.
 * 
 * @param {ServiceContext} ownServiceContext = The ServiceContext of this service being deleted
 * @returns {Promise.<UnDeployContext>} - The UnDeployContext that represents the deletion of this service
 */
exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'MySQL')
        .then(upDeployContext => {
            let paramsToDelete = [
                deployersCommon.getSsmParamName(ownServiceContext, "db_password")
            ]
            return ssmCalls.deleteParameters(paramsToDelete)
                .then(() => {
                    return upDeployContext;
                });
        });
}

/**
 * List of event sources this service can integrate with.
 * 
 * If the list is empty, this service cannot produce events to other services.
 */
exports.producedEventsSupportedServices = [];


/**
 * The list of output types that this service produces. 
 * 
 * If the list is empty, this service cannot be consumed by other resources.
 * 
 * Valid list values: environmentVariables, scripts, policies, credentials, securityGroups
 */
exports.producedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'securityGroups'
];

/**
 * The list of output types that this service consumes from other dependencies.
 * 
 * If the list is empty, this service cannot consume other services.
 * 
 * Valid list values: environmentVariables, scripts, policies, credentials, securityGroups
 */
exports.consumedDeployOutputTypes = [];
