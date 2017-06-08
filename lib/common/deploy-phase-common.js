/*
 * Copyright 2017 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const iamCalls = require('../aws/iam-calls');
const s3Calls = require('../aws/s3-calls');
const cloudformationCalls = require('../aws/cloudformation-calls');
const winston = require('winston');
const accountConfig = require('../common/account-config')().getAccountConfig();
const fs = require('fs');
const util = require('../common/util');
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

exports.getSsmParamName = function (serviceContext, suffix) {
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

/**
 * Do a one-time creation of the custom role.
 * 
 * Subsequent runs will not update the role's policy. If the policy needs to be changed, the role will need to be recreated.
 */
exports.createCustomRole = function (trustedService, roleName, policyStatementsToConsume) {
    return iamCalls.getRole(roleName)
        .then(role => {
            if (!role) {
                return iamCalls.createRole(roleName, trustedService)
                    .then(createdRole => {
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
            else {
                return role;
            }
        });
}

exports.getAllPolicyStatementsForServiceRole = function (ownServicePolicyStatements, dependenciesDeployContexts) {
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

exports.deployCloudFormationStack = function (stackName, cfTemplate, cfParameters, updatesSupported, serviceType) {
    return cloudformationCalls.getStack(stackName)
        .then(stack => {
            if (!stack) {
                winston.info(`${serviceType} - Creating stack '${stackName}'`);
                return cloudformationCalls.createStack(stackName, cfTemplate, cfParameters);
            }
            else {
                if (updatesSupported) {
                    winston.info(`${serviceType} - Updates stack '${stackName}'`);
                    return cloudformationCalls.updateStack(stackName, cfTemplate, cfParameters);
                }
                else {
                    winston.info(`${serviceType} - Updates not supported for this service type`);
                    return stack;
                }
            }
        })
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
    return [
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


exports.getEventConsumerConfigParams = function (producerServiceContext, consumerServiceContext) {
    let consumerServiceName = consumerServiceContext.serviceName;
    for (let eventConsumerConfig of producerServiceContext.params.event_consumers) {
        if (eventConsumerConfig.service_name === consumerServiceName) {
            return eventConsumerConfig;
        }
    }
    return null; //Return null if nothing found for the consumer service in the producer service config
}