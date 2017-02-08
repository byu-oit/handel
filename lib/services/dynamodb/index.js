
var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB();


let keyTypeToAttributeType = {
    String: "S",
    Number: "N"
}


function associateTagsWithTable() {
    console.log("NOT IMPLEMENTED YET TO TAG DYNAMODB TABLE");
}

function tableExists(tableName) {
    return new Promise((resolve, reject) => {
        let describeTableParams = {
            TableName: tableName
        };

        dynamodb.describeTable(describeTableParams, function(err, data) {
            if(err) { reject(err); }
            else {
                console.log(data);
                resolve();
            }
        });
    });
}

function createTable(tableName, params) {
    return new Promise((resolve, reject) => {
        let createTableParams = {
            AttributeDefinitions: [
                {
                    AttributeName: params.partition_key.name,
                    AttributeType: keyTypeToAttributeType[params.partition_key.type],
                },
                {
                    AttributeName: params.sort_key.name,
                    AttributeType: keyTypeToAttributeType[params.sort_key.type]
                }
            ],
            KeySchema: [
                {
                    AttributeName: params.partition_key.name,
                    KeyType: "HASH"
                },
                {
                    AttributeName: params.sort_key.name,
                    KeyType: "RANGE"
                }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: params.provisioned_throughput.read_capacity_units,
                WriteCapacityUnits: params.provisioned_throughput.write_capacity_units
            },
            TableName: tableName
        };

        console.log("Creating table!");
        console.log(createTableParams);
        resolve();

        // dynamodb.createTable(createTableParams, function(err, data) {
        //         if(err) {
        //             console.log(err);
        //             reject(err);
        //         }
        //         else {
        //             console.log(data);
        //             resolve();
        //         }
        // });
    });
}

function updateTable() {
    console.log("NOT IMPLEMENTED!");
    //Use updateTable in DynamoDB - NEED TO BE CAREFUL
}

/**
 * Checks the service parameters for the deployable service in order to provide a 
 * fail-fast mechanism 
 */
exports.check = function() {
    console.log("Check DynamoDB -- NOT IMPLEMENTED");
    return [];
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
exports.deploy = function(serviceContext, dependenciesServiceOutputs) {
    console.log("Deploying dynamodb service: " + serviceContext.name);

    var params = serviceContext.params;

    var tableName = `${serviceContext.appName}_${serviceContext.environmentName}_${serviceContext.name}`

    console.log(tableName); //TODO - Remove later

    return tableExists(tableName);

    // if(tableExists(tableName)) { //Update
    //     updateTable();
    // }
    // else { //Create
    //     createTable(tableName, params);
    // }

    associateTagsWithTable();

    // return new Promise((resolve, reject) => {
    //     TODO - Handle updates in the service
        

    //     setTimeout(function() {
    //         console.log("Finished dynamodb service deploy: " + serviceContext.name);

    //         var deployedServiceOutputs = { //TODO - THIS IS STUB DATA
    //             policies: [],
    //             credentials: [],
    //             params: ['SOME_ENV_VAR_FOR_DYNAMO', 'ANOTHER_ENV_VAR_FOR_DYNAMO']
    //         }
    //         serviceContext.deployedServiceOutputs = deployedServiceOutputs;
    //         resolve();

    //         //Else reject promise
    //     }, Math.random() * 1000 + 1000);
    // });
}