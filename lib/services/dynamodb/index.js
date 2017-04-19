const AWS = require('aws-sdk');
const winston = require('winston');
const randtoken = require('rand-token');
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../deployers-common');
const util = require('../../util/util');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const keyTypeToAttributeType = {
    String: "S",
    Number: "N"
}

function getTablePolicyForDependentServices(table) {
    return {
        "Sid": `DyanmoDBAccess${randtoken.generate(16)}`,
        "Effect": "Allow",
        "Action": [
            "dynamodb:BatchGetItem",
            "dynamodb:BatchWriteItem",
            "dynamodb:DeleteItem",
            "dynamodb:DescribeLimits",
            "dynamodb:DescribeReservedCapacity",
            "dynamodb:DescribeReservedCapacityOfferings",
            "dynamodb:DescribeStream",
            "dynamodb:DescribeTable",
            "dynamodb:GetItem",
            "dynamodb:GetRecords",
            "dynamodb:GetShardIterator",
            "dynamodb:ListStreams",
            "dynamodb:PutItem",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:UpdateItem"
        ],
        "Resource": [
            table.TableArn
        ]
    }
}

function getDeployContext(serviceContext, table) {
    let deployContext = new DeployContext(serviceContext);
    deployContext.policies.push(getTablePolicyForDependentServices(table));
    
    let tableNameEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'TABLE_NAME');
    deployContext.environmentVariables[tableNameEnv] = table.TableName;
    let tableArnEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'TABLE_ARN');
    deployContext.environmentVariables[tableArnEnv] = table.TableArn;
    return deployContext;
}

function getTable(dynamodb, tableName) {
    winston.info(`Getting data for table ${tableName}`);
    let describeTableParams = {
        TableName: tableName
    };
    return dynamodb.describeTable(describeTableParams).promise()
        .then(tableData => { //Table exists
            return tableData.Table;
        })
        .catch(err => {
            if(err.statusCode === 400 && err.code === 'ResourceNotFoundException') {
                winston.info(`Table ${tableName} does not exist`);
                return null;
            }
            throw err; //Some other error happened
        });
}

function getCloudFormationStackParams(stackName, serviceParams) {
    let stackParams = {
        TableName: stackName,
        PartitionKeyName: serviceParams.partition_key.name,
        PartitionKeyType: keyTypeToAttributeType[serviceParams.partition_key.type]
    }

    //Add sort key if provided
    if(serviceParams.sort_key) {
        stackParams.SortKeyName = serviceParams.sort_key.name,
        stackParams.SortKeyType = keyTypeToAttributeType[serviceParams.sort_key.type]
    }

    //Add provisioned throughput if provided
    if(serviceParams.provisioned_throughput && serviceParams.provisioned_throughput.read_capacity_units) {
        stackParams.ReadCapacityUnits = serviceParams.provisioned_throughput.read_capacity_units.toString();
    }
    if(serviceParams.provisioned_throughput && serviceParams.provisioned_throughput.write_capacity_units) {
        stackParams.WriteCapacityUnits = serviceParams.provisioned_throughput.write_capacity_units.toString();
    }

    return cloudFormationCalls.getCfStyleStackParameters(stackParams)
}

/**
 * Checks the given service for required parameters and correctness. This provides
 * a fail-fast mechanism for configuration errors before deploy is attempted.
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Array} - 0 or more String error messages
 */
exports.check = function(serviceContext) {
    let errors = [];
    let params = serviceContext.params;

    if(!params.partition_key) {
        errors.push("DynamoDB - partition_key section is required");
    }
    else {
        if(!params.partition_key.name) {
            errors.push("DynamoDB - name field in partition_key is required");
        }
        if(!params.partition_key.type) {
            errors.push("DynamoDB - type field in partition_key is required");
        }
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
exports.preDeploy = function(serviceContext) {
    winston.info(`DynamoDB - PreDeploy not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

/**
 * Return the PreDeployContext for a service who is referencing your deployed service externally.
 * 
 * This method is the equivalent of preDeploy when someone else in another application is consuming
 * this service. This method takes the external dependency ServiceContext, and returns the PreDeployContext
 * for the external service. 
 * 
 * If PreDeploy has not been run yet for this service, this function should return an error. 
 * 
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external reference for which to get its PreDeployContext
 * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the PreDeploy phase.
 */
exports.getPreDeployContextForExternalRef = function(externalRefServiceContext) {
    winston.info(`DynamoDB - Getting PreDeploy context for external service`);
    return Promise.resolve(new PreDeployContext(externalRefServiceContext));
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
exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`DynamoDB - Bind not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

/**
 * Returns the BindContext for a service that is referenced externally in your deployed service.
 * 
 * This method is the equivalent of running Bind on an internal service when you are referencing
 * an external service. This method takes the external dependency ServiceContext and PreDeployContext,
 * as well as your deploying service's ServiceContext and PreDeployContext. It returns the
 * BindContext for the linkage of the two services.
 * 
 * If Bind has not yet been run on the external service, this method should return an error. 
 *
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external reference service that was bound to the depdendent service
 * @param {PreDeployContext} externalRefPreDeployContext - The PreDeployContext of the external reference service that was bound to the depdendent service
 * @param {ServiceContext} dependentOfServiceContext - The ServiceContext of the service being deployed that depends on the external service
 * @param {PreDeployContext} dependentOfPreDeployContext - The PreDeployContext of the service being deployed that depends on the external service
 * @returns {Promise.<BindContext>} - A Promise of the BindContext results from the Bind
 */
exports.getBindContextForExternalRef = function(externalRefServiceContext, externalRefPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`DynamoDB - Getting BindContext for external service`);
    //No bind, so just return empty bind context
    return Promise.resolve(new BindContext(externalRefServiceContext, dependentOfServiceContext));
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
exports.deploy = function(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    const dynamodb = new AWS.DynamoDB({ //I do this here because the aws-mock tool I use requires it
        apiVersion: '2012-08-10'
    });
    var stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`DynamoDB - Deploying table ${stackName}`);

    return cloudFormationCalls.getStack(stackName)
        .then(stack => {
            if(!stack) { //Create
                let dynamoTemplate = util.readFileSync(`${__dirname}/dynamodb.yml`);
                let stackParams = getCloudFormationStackParams(stackName, ownServiceContext.params);

                //Create the stack and return the table
                return cloudFormationCalls.createStack(stackName, dynamoTemplate, stackParams)
                    .then(createdStack => {
                        return getTable(dynamodb, stackName)
                            .then(table => {
                                winston.info(`DynamoDB - Finished deploying table ${stackName}`);
                                return getDeployContext(ownServiceContext, table);
                            });
                    });
            }
            else {
                winston.warn("DynamoDB - Updates not suported on DynamoDB");
                return getTable(dynamodb, stackName)
                    .then(table => {
                        return getDeployContext(ownServiceContext, table);
                    });
            }
        });
}

/**
 * Returns the DeployContext for a service who is being referenced externally from your application.
 * 
 * This method is the equivalent of deploy when you are consuming an external service. This
 * method takes the external dependency ServiceContext, and returns the DeployContext for
 * the external service. 
 * 
 * If Deploy has not been run yet for the external service, this method should return an error.
 * 
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external service for which to get the DeployContext
 * @returns {Promise.<DeployContext>} - A Promise of the DeployContext from this deploy
 */
exports.getDeployContextForExternalRef = function(externalRefServiceContext) {
    const dynamodb = new AWS.DynamoDB({ //I do this here because the aws-mock tool I use requires it
        apiVersion: '2012-08-10'
    });
    winston.info(`DynamoDB - Getting DeployContext for external reference`);
    let externalRefStackName = deployersCommon.getResourceName(externalRefServiceContext);
    return cloudFormationCalls.getStack(externalRefStackName)
        .then(externalRefStack => {
            if(externalRefStack) {
                return getTable(dynamodb, externalRefStackName)
                    .then(externalRefTable => {
                        return getDeployContext(externalRefServiceContext, externalRefTable);
                    });
            }
            else {
                throw new Error(`External service ${externalRefServiceContext} does not exist. You must deploy it independently first before trying to reference it in this application!`);
            }
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
exports.consumeEvents = function(ownServiceContext, ownDeployContext, producerServiceContext, producerDeployContext) {
    return Promise.reject(new Error("The DynamoDB service doesn't consume events from other services"));
}

/**
 * Returns the ConsumeEventsContext for the given service consuming events from the given external service
 * 
 * This method is the equivalent of consumeEvents when you are consuming events from an external service.
 * This method takes the consumer's ServiceContext and DeployContext, as well as the external service
 * producer's ServiceContext and DeployContext.
 * 
 * If ConsumeEvents has not been run yet for the given service, this method should return an error.
 * 
 * @param {ServiceContext} ownServiceContext - The ServiceContext of this service consuming events
 * @param {DeployContext} ownDeployContext - The DeployContext of this service consuming events
 * @param {ServiceContext} externalRefServiceContext - The ServiceContext of the external service that is producing events for this service
 * @param {DeployContext} externalRefDeployContext - The DeployContext of the service that is producing events for this service
 * @returns {Promise.<ConsumeEventsContext>} - The information about the event consumption for this service
 */
exports.getConsumeEventsContextForExternalRef = function(ownServiceContext, ownDeployContext, externalRefServiceContext, externalRefDeployContext) {
    return Promise.reject(new Error("The DynamoDB service doesn't consume events from other services"));
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
exports.produceEvents = function(ownServiceContext, ownDeployContext, consumerServiceContext, consumerDeployContext) {
    return Promise.reject(new Error("The DynamoDB service doesn't produce events for other services"));
}

/**
 * List of event sources this service can integrate with.
 * 
 * If the list is empty, this service cannot produce events to other services.
 */
exports.producedEventsSupportedServices = [];


/**
 * The list of output types that this service produces. 
 * 
 * If the list is empty, this service cannot be consumed by other resources.
 * 
 * Valid list values: environmentVariables, scripts, policies, credentials, securityGroups
 */
exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

/**
 * The list of output types that this service consumes from other dependencies.
 * 
 * If the list is empty, this service cannot consume other services.
 * 
 * Valid list values: environmentVariables, scripts, policies, credentials, securityGroups
 */
exports.consumedDeployOutputTypes = [];