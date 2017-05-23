const iamCalls = require('../aws/iam-calls');
const s3Calls = require('../aws/s3-calls');
const ec2Calls = require('../aws/ec2-calls');
const cloudformationCalls = require('../aws/cloudformation-calls');
const UnDeployContext = require('../datatypes/un-deploy-context');
const winston = require('winston');
const accountConfig = require('../util/account-config')().getAccountConfig();
const fs = require('fs');
const util = require('../util/util');
const handlebarsUtils = require('../util/handlebars-utils');
const os = require('os');

/**
 * Given a ServiceContext and suffix, return the env var name used for environment variables naming
 * All dashes are substituted for underscores.
 * 
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to get the prefix for
 * @param {String} suffix - The remaining part of the environment variable
 * @returns {String} - The environment variable prefix string constructed from the service context
 */
exports.getInjectedEnvVarName = function (serviceContext, suffix) {
    return `${serviceContext.serviceType}_${serviceContext.appName}_${serviceContext.environmentName}_${serviceContext.serviceName}_${suffix}`.toUpperCase().replace(/-/g, "_");
}

exports.getSsmParamName = function(serviceContext, suffix) {
    return `${serviceContext.appName}.${serviceContext.environmentName}.${serviceContext.serviceName}.${suffix}`;
}

exports.getEnvVarsFromServiceContext = function (serviceContext) {
    let envVars = {};
    envVars['HANDEL_APP_NAME'] = serviceContext.appName;
    envVars['HANDEL_ENVIRONMENT_NAME'] = serviceContext.environmentName;
    envVars['HANDEL_SERVICE_NAME'] = serviceContext.serviceName;
    envVars['HANDEL_SERVICE_VERSION'] = serviceContext.deployVersion;
    return envVars;
}

exports.getEnvVarsFromDependencyDeployContexts = function (deployContexts) {
    let envVars = {};
    for (let deployContext of deployContexts) {
        for (let envVarKey in deployContext.environmentVariables) {
            envVars[envVarKey] = deployContext.environmentVariables[envVarKey];
        }
    }
    return envVars;
}

exports.createCustomRole = function(trustedService, roleName, policyStatementsToConsume) {
    return iamCalls.createRoleIfNotExists(roleName, trustedService)
        .then(role => {
            if (policyStatementsToConsume.length > 0) { //Only add policies if there are any to consume
                let policyArn = `arn:aws:iam::${accountConfig.account_id}:policy/services/${roleName}`;
                let policyDocument = iamCalls.constructPolicyDoc(policyStatementsToConsume);
                return iamCalls.createOrUpdatePolicy(roleName, policyArn, policyDocument)
                    .then(policy => {
                        return iamCalls.attachPolicyToRole(policy.Arn, roleName);
                    })
                    .then(policyAttachment => {
                        return iamCalls.getRole(roleName);
                    });
            }
            else { //No policies on the role
                return iamCalls.getRole(roleName);
            }
        });
}

exports.getAllPolicyStatementsForServiceRole = function(ownServicePolicyStatements, dependenciesDeployContexts) {
    let policyStatementsToConsume = [];

    //Add policies from dependencies that have them
    for (let deployContext of dependenciesDeployContexts) {
        for (let policyDoc of deployContext.policies) {
            policyStatementsToConsume.push(policyDoc);
        }
    }

    //Let consuming service add its own policy if needed
    for (let ownServicePolicyStatement of ownServicePolicyStatements) {
        policyStatementsToConsume.push(ownServicePolicyStatement);
    }

    return policyStatementsToConsume;
}

exports.createSecurityGroupForService = function (stackName, sshBastionIngressPort) {
    let sgName = `${stackName}-sg`;
    let handlebarsParams = {
        groupName: sgName,
        vpcId: accountConfig.vpc
    }
    if(sshBastionIngressPort) {
        handlebarsParams.sshBastionSg = accountConfig.ssh_bastion_sg;
        handlebarsParams.sshBastionIngressPort = sshBastionIngressPort;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/ec2-sg-template.yml`, handlebarsParams)
        .then(compiledTemplate => {
            return cloudformationCalls.getStack(sgName)
                .then(stack => {
                    if(!stack) {
                        return cloudformationCalls.createStack(sgName, compiledTemplate, []);
                    }
                    else {
                        return cloudformationCalls.updateStack(sgName, compiledTemplate, []);
                    }
                });
        })
        .then(deployedStack => {
            let groupId = cloudformationCalls.getOutput('GroupId', deployedStack)
            return ec2Calls.getSecurityGroupById(groupId, accountConfig.vpc);
        });
}

exports.unBindAllOnSg = function(stackName) {
    let sgName = `${stackName}-sg`;
    return ec2Calls.removeAllIngressFromSg(sgName, accountConfig.vpc)
        .then(() => {
            return true;
        });
}

exports.deleteSecurityGroupForService = function(stackName) {
    let sgName = `${stackName}-sg`;
    return cloudformationCalls.getStack(sgName)
        .then(stack => {
            if(stack) {
                return cloudformationCalls.deleteStack(sgName)
            }
            else {
                return true;
            }
        });
}

exports.unDeployCloudFormationStack = function(serviceContext, serviceType) {
    let stackName = exports.getResourceName(serviceContext);
    winston.info(`${serviceType} - Executing UnDeploy on '${stackName}'`)

    return cloudformationCalls.getStack(stackName)
        .then(stack => {
            if (stack) {
                winston.info(`${serviceType} - Deleting stack '${stackName}'`);
                return cloudformationCalls.deleteStack(stackName);
            }
            else {
                winston.info(`${serviceType} - Stack '${stackName}' has already been deleted`);
            }
        })
        .then(() => {
            return new UnDeployContext(serviceContext);
        });
}

exports.checkRoutingElement = function (serviceContext) {
    let errors = [];
    let serviceParams = serviceContext.params;
    if (serviceParams.routing) {
        if (!serviceParams.routing.type) {
            errors.push(`${serviceContext.serviceType} - The 'type' field is required in the 'routing' section`);
        }
        else {
            if (serviceParams.routing.type === 'https' && !serviceParams.routing.https_certificate) {
                errors.push(`${serviceContext.serviceType} - The 'https_certificate' element is required when you are using 'https' as the routing type`);
            }
        }
    }
    return errors;
}

exports.getRoutingInformationForService = function (serviceContext) {
    let serviceParams = serviceContext.params;
    if (serviceParams.routing) {
        let routingInfo = {
            type: serviceParams.routing.type,
            timeout: 60,
            healthCheckPath: '/'
        };
        if (serviceParams.routing.timeout) {
            routingInfo.timeout = serviceParams.routing.timeout;
        }
        if (serviceParams.routing.health_check_path) {
            routingInfo.healthCheckPath = serviceParams.routing.health_check_path;
        }
        if (routingInfo.type === 'https') {
            routingInfo.httpsCertificate = `arn:aws:acm:us-west-2:${accountConfig.account_id}:certificate/${serviceParams.routing.https_certificate}`;
        }
        return routingInfo;
    }
    return null; //No routing specified
}

exports.uploadFileToHandelBucket = function (serviceContext, diskFilePath, s3FileName) {
    let bucketName = `handel-${accountConfig.region}-${accountConfig.account_id}`;

    let artifactPrefix = `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}`;
    let artifactKey = `${artifactPrefix}/${s3FileName}`;
    return s3Calls.createBucketIfNotExists(bucketName, accountConfig.region) //Ensure Handel bucket exists in this region
        .then(bucket => {
            return s3Calls.uploadFile(bucketName, artifactKey, diskFilePath)
        })
        .then(s3ObjectInfo => {
            return s3Calls.cleanupOldVersionsOfFiles(bucketName, artifactPrefix)
                .then(() => {
                    return s3ObjectInfo;
                });
        });
}

exports.uploadDeployableArtifactToHandelBucket = function (serviceContext, s3FileName) {
    let pathToArtifact = serviceContext.params.path_to_code;
    let fileStats = fs.lstatSync(pathToArtifact);
    if (fileStats.isDirectory()) { //Zip up artifact
        let zippedPath = `${os.tmpdir()}/${s3FileName}.zip`;
        return util.zipDirectoryToFile(pathToArtifact, zippedPath)
            .then(() => {
                return exports.uploadFileToHandelBucket(serviceContext, zippedPath, s3FileName)
                    .then(s3ObjectInfo => {
                        //Delete temporary file
                        fs.unlinkSync(zippedPath);
                        return s3ObjectInfo;
                    });
            });
    }
    else { //Is file (i.e. WAR file or some other already-compiled archive), just upload directly
        return exports.uploadFileToHandelBucket(serviceContext, pathToArtifact, s3FileName)
            .then(s3ObjectInfo => {
                return s3ObjectInfo;
            });
    }
}

exports.getAppSecretsAccessPolicyStatements = function (serviceContext) {
    return  [
        {
            Effect: "Allow",
            Action: [
                "ssm:DescribeParameters"
            ],
            Resource: [
                "*"
            ]
        },
        {
            Effect: "Allow",
            Action: [
                "ssm:GetParameters"
            ],
            Resource: [
                `arn:aws:ssm:${accountConfig.region}:${accountConfig.account_id}:parameter/${serviceContext.appName}.${serviceContext.environmentName}*`
            ]
        }
    ]
}

exports.getResourceName = function (serviceContext) {
    return `${serviceContext.appName}-${serviceContext.environmentName}-${serviceContext.serviceName}-${serviceContext.serviceType}`;
}


exports.getEventConsumerConfigParams = function(producerServiceContext, consumerServiceContext) {
    let consumerServiceName = consumerServiceContext.serviceName;
    for(let eventConsumerConfig of producerServiceContext.params.event_consumers) {
        if(eventConsumerConfig.service_name === consumerServiceName) {
            return eventConsumerConfig;
        }
    }
    return null; //Return null if nothing found for the consumer service in the producer service config
}