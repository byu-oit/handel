var AWS = require('aws-sdk');
var winston = require('winston');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
var dynamodb = new AWS.DynamoDB({
    apiVersion: '2012-08-10'
});


let keyTypeToAttributeType = {
    String: "S",
    Number: "N"
}

function getTablePolicyForDependentServices(tableData) {
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": `DyanmoDB_${tableData.Table.TableName}_Access`,
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
                    tableData.Table.TableArn
                ]
            }
        ]
    }
}

function getDeployContext(serviceContext, tableData) {
    let deployContext = new DeployContext(serviceContext);

    let deployedServiceOutputs = {
        policies: [ getTablePolicyForDependentServices(tableData) ],
        params: {},
        credentials: {}
    }
    var appName = serviceContext.appName.toUpperCase();
    var environmentName = serviceContext.environmentName.toUpperCase();
    var serviceName = serviceContext.serviceName.toUpperCase();
    deployedServiceOutputs.params[`DYNAMODB_${appName}_${environmentName}_${serviceName}_TABLE_NAME`] = tableData.Table.TableName;
    deployedServiceOutputs.params[`DYNAMODB_${appName}_${environmentName}_${serviceName}_TABLE_ARN`] = tableData.Table.TableArn;
    return deployedServiceOutputs;
}

function getTable(tableName) {
    return new Promise((resolve, reject) => {
        winston.info(`Getting data for table ${tableName}`);
        let describeTableParams = {
            TableName: tableName
        };

        dynamodb.describeTable(describeTableParams, function(err, tableData) {
            if(err) {
                if(err.statusCode === 400 && err.code === 'ResourceNotFoundException') {
                    winston.info(`Table ${tableName} does not exist`);
                    resolve(null); //Table does not exist
                }
                else { //Some other error happened
                    reject(err);
                }
            }
            else {
                resolve(tableData); //Table exists
            }
        });
    });
}

function waitForTable(tableName) {
    return new Promise((resolve, reject) => {
        winston.info("Waiting for table to be in the ACTIVE state");
        var params = {
            TableName: tableName
        };
        dynamodb.waitFor('tableExists', params, function(err, data) {
            if (err) {
                reject(err)
            }
            else {
                resolve(data);
            }
        });
    });
}

function createTable(tableName, params) {
    return new Promise((resolve, reject) => {
        winston.info(`Creating new DynamoDB table: ${tableName}`)

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
                ReadCapacityUnits: params.provisioned_throughput.read_capacity_units,
                WriteCapacityUnits: params.provisioned_throughput.write_capacity_units
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

        dynamodb.createTable(createTableParams, function(err, createTableData) {
                if(err) {
                    winston.error(`Error creating DynamoDB table: ${err}`);
                    reject(err);
                }
                else {
                    waitForTable(tableName)
                        .then(() => {
                            winston.info(`Created DynamoDB table: ${tableName}`);
                            getTable(tableName)
                                .then(tableData => {
                                    resolve(tableData);
                                });
                        })
                        .catch(err => {
                            reject(err);
                        });
                }
        });
    });
}

/**
 * No updates supported on DynamoDB since it makes the table unavailable. All updates must be performed
 *  manually by a developer.
 */
function updateTable(tableData) {
    winston.warn("Updates not suported on DynamoDB");

    //TODO - Determine on whether an update was requested (different than config) and notify of manual updates
    return tableData; //Just return existing table data
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

    if(!params.provisioned_throughput) {
        errors.push("DynamoDB - provisioned_throughput secion is required");
    }
    else {
        if(!params.provisioned_throughput.read_capacity_units) {
            errors.push("DynamoDB - read_capacity_units in provisioned_throughput is required");
        }

        if(!params.provisioned_throughput.write_capacity_units) {
            errors.push("DynamoDB - write_capacity_units in provisioned_throughput is required");
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
    winston.info(`Deploying dynamodb service: ${ownServiceContext.serviceName}`);

    var params = ownServiceContext.params;

    var tableName = `${ownServiceContext.appName}_${ownServiceContext.environmentName}_${ownServiceContext.serviceName}`

    return getTable(tableName) //Check if table exists
        .then(tableData => {
            if(!tableData) { //Create
                return createTable(tableName, params);
            }
            else { //Update
                return updateTable(tableData);
            }
        })
        .then(tableData => {
            return getDeployContext(ownServiceContext, tableData);
        });
}