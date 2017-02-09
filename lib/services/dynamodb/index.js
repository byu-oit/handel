var AWS = require('aws-sdk');
var winston = require('winston');
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

function getDeployedServiceOutputs(serviceContext, tableData) {
    let deployedServiceOutputs = {
        policies: [ getTablePolicyForDependentServices(tableData) ],
        params: {},
        credentials: {}
    }
    var appName = serviceContext.appName.toUpperCase();
    var environmentName = serviceContext.environmentName.toUpperCase();
    var serviceName = serviceContext.name.toUpperCase();
    deployedServiceOutputs.params[`DYNAMODB_${appName}_${environmentName}_${serviceName}_TABLE_NAME`] = tableData.Table.TableName;
    deployedServiceOutputs.params[`DYNAMODB_${appName}_${environmentName}_${serviceName}_TABLE_ARN`] = tableData.Table.TableArn;
    return deployedServiceOutputs;
}

function associateTagsWithTable() {
    winston.error("NOT IMPLEMENTED YET TO TAG DYNAMODB TABLE");
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
 * Checks the service parameters for the deployable service in order to provide a 
 * fail-fast mechanism 
 */
exports.check = function(serviceContext) {
    var errors = [];

    if(!serviceContext.partition_key) {
        errors.push("DynamoDB - partition_key section is required");
    }
    else {
        if(!serviceContext.partition_key.name) {
            errors.push("DynamoDB - name field in partition_key is required");
        }
        if(!serviceContext.partition_key.type) {
            errors.push("DynamoDB - type field in partition_key is required");
        }
    }

    if(!serviceContext.provisioned_throughput) {
        errors.push("DynamoDB - provisioned_throughput secion is required");
    }
    else {
        if(!serviceContext.provisioned_throughput.read_capacity_units) {
            errors.push("DynamoDB - read_capacity_units in provisioned_throughput is required");
        }

        if(!serviceContext.provisioned_throughput.write_capacity_units) {
            errors.push("DynamoDB - write_capacity_units in provisioned_throughput is required");
        }
    }

    return errors;
}

/**
 * Deploy the instance of the service based on the service params passed in.
 * 
 * Parameters:
 * - Service context for the service to be deployed
 * - List of outputs from deployed service that this service depends on (if any)
 * 
 * Return a list of items for use by other services who depend on this one:
 *    {
 *      policies: [], //Policies the consuming service can use when creating service roles in order to talk to this service
 *      credentials: [], //Items intended to be made securely available to the consuming service (via a secure S3 location)
 *      outputs: [] //Items intended to be injected as environment variables into the consuming service
 *    }
 */
exports.deploy = function(serviceContext, dependenciesServiceContexts) {
    winston.info(`Deploying dynamodb service: ${serviceContext.name}`);

    var params = serviceContext.params;

    var tableName = `${serviceContext.appName}_${serviceContext.environmentName}_${serviceContext.name}`

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
            associateTagsWithTable();
            let deployedServiceOutputs = getDeployedServiceOutputs(serviceContext, tableData);
            serviceContext.deployedServiceOutputs = deployedServiceOutputs;
        });
}