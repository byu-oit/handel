const AWS = require('aws-sdk');
const winston = require('winston');
const randtoken = require('rand-token');
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
    
    var appName = serviceContext.appName.toUpperCase();
    var environmentName = serviceContext.environmentName.toUpperCase();
    var serviceName = serviceContext.serviceName.toUpperCase();
    deployContext.outputs[`DYNAMODB_${appName}_${environmentName}_${serviceName}_TABLE_NAME`] = table.TableName;
    deployContext.outputs[`DYNAMODB_${appName}_${environmentName}_${serviceName}_TABLE_ARN`] = table.TableArn;
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

function waitForTable(dynamodb, tableName) {
    winston.info("Waiting for table to be in the ACTIVE state");
    var waitParams = {
        TableName: tableName
    };
    return dynamodb.waitFor('tableExists', waitParams).promise()
        .then(tableData => {
            return tableData.Table;
        });
}

function createTable(dynamodb, tableName, params) {
    winston.info(`Creating new DynamoDB table: ${tableName}`)

    let readCapacityUnits = 5; //Default to 5 if none provided by user
    let writeCapacityUnits = 5; //Default to 5 if none provided by user
    if(params.provisioned_throughput && params.provisioned_throughput.read_capacity_units) {
        readCapacityUnits = params.provisioned_throughput.read_capacity_units;
    }
    if(params.provisioned_throughput && params.provisioned_throughput.write_capacity_units) {
        writeCapacityUnits = params.provisioned_throughput.write_capacity_units;
    }

    let createTableParams = {
        AttributeDefinitions: [
            {
                AttributeName: params.partition_key.name,
                AttributeType: keyTypeToAttributeType[params.partition_key.type],
            }
        ],
        KeySchema: [
            {
                AttributeName: params.partition_key.name,
                KeyType: "HASH"
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: readCapacityUnits,
            WriteCapacityUnits: writeCapacityUnits
        },
        TableName: tableName
    };

    if(params.sort_key) { //Optional param
        createTableParams.AttributeDefinitions.push({
            AttributeName: params.sort_key.name,
            AttributeType: keyTypeToAttributeType[params.sort_key.type]
        });
        createTableParams.KeySchema.push({
            AttributeName: params.sort_key.name,
            KeyType: "RANGE"
        });
    }

    return dynamodb.createTable(createTableParams).promise()
        .then(tableData => {
            return waitForTable(dynamodb, tableName)
        });
}

/**
 * No updates supported on DynamoDB since it makes the table unavailable. All updates must be performed
 *  manually by a developer.
 */
function updateTable(table) {
    winston.warn("Updates not suported on DynamoDB");
    //TODO - Determine on whether an update was requested (different than config) and notify of manual updates
    return table; //Just return existing table data
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
    //Noop - No resources required in PreDeploy, so just return an empty PreDeployContext
    return new Promise((resolve, reject) => {
        resolve(new PreDeployContext(serviceContext));
    })
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
    //Noop, nothing done by Dynamo in bind, so just return an empty BindContext
    return new Promise((resolve, reject) => {
        resolve(new BindContext(ownServiceContext));
    })
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
    winston.info(`Deploying dynamodb service: ${ownServiceContext.serviceName}`);

    var params = ownServiceContext.params;

    var tableName = `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}`

    return getTable(dynamodb, tableName) //Check if table exists
        .then(table => {
            if(!table) { //Create
                return createTable(dynamodb, tableName, params);
            }
            else { //Update
                return updateTable(table);
            }
        })
        .then(table => {
            return getDeployContext(ownServiceContext, table);
        });
}