const AWS = require('aws-sdk');
const winston = require('winston');
const fs = require('fs');
const util = require('../../util/util');
const beanstalk = new AWS.ElasticBeanstalk({
    apiVersion: '2010-12-01'
});

function getApplication(applicationName) {
    return new Promise((resolve, reject) => {
        let describeApplicationParams = {
            ApplicationNames: [ applicationName ]
        }
        beanstalk.describeApplications(describeApplicationParams, function(err, applicationData) {
            if(err) { 
                reject(err) 
            }
            else {
                if(applicationData.Applications.length > 0) {
                    resolve(applicationData.Applications[0]);
                }
                else {
                    resolve(null);
                }
            }
        })
    });
}

function getEnvironment(applicationName) {
    return new Promise((resolve, reject) => {
        let describeEnvironmentsParams = {
            ApplicationName: [ applicationName ]
        }
        beanstalk.describeEnvironments(describeEnvironmentsParams, function(err, describeEnvironmentsData) {
            if(err) { reject(err); }
            else {
                if(describeEnvironmentsData.Environments.length > 0) {
                    //This assumes there is only ever one environment per application. If we implement
                    //  a/b deploys, then this will have to change to be smarter
                    resolve(describeEnvironmentsData.Environments[0]);
                }
                else {
                    resolve(null);
                }
            }   
        });
    });
}

function createApplication(applicationName) {
    return new Promise((resolve, reject) => {
        winston.info(`Creating application ${applicationName}`);
        let createApplicationParams = {
            ApplicationName: applicationName,
            Description: applicationName 
            //TODO - IMPLEMENT RESOURCE LIFECYCLE CONFIG
        }
        beanstalk.createApplication(createApplicationParams, function(err, createApplicationData) {
            if (err) { reject(err); }
            else {
                winston.info(`Created application ${applicationName}`);
                resolve(createApplicationData);
            }
        });
    });
}

function createApplicationIfNotExists(applicationName) {
    return getApplication(applicationName)
        .then(applicationData => {
            if(applicationData) { //Already exists
                winston.info(`Application ${applicationName} already exists`)
                return applicationData;
            }
            else { //Application doesn't exist, so create it
                return createApplication(applicationName)
                    .then(() => {
                        return getApplication(applicationName)
                            .then(createdApplicationData => {
                                return createdApplicationData;
                            })
                    })
            }
        });
}

function createEnvironment(applicationName, serviceContext) {
    //TODO - NEED TO PROBABLY CREATE AN ENVIRONMENT CONFIG
        //IS THIS HOW WE INJECT THINGS LIKE IAM ROLES?

    return new Promise((resolve, reject) => {
        let createEnvironmentParams = {
            ApplicationName: applicationName,
            EnvironmentName: applicationName,
            SolutionStackName: serviceContext.params.solution_stack,
            VersionLabel: "", //TODO - NEED TO UPLOAD AND HAVE AN APPLICATION VERSION
            Tier: {
                Name: "WebServer",
                Type: "Standard",
                Version: " "
            }
            //TODO - TAGS
        };

        beanstalk.createEnvironment(createEnvironmentParams, function(err, createEnvironmentData) {
            if (err) { reject(err) }
            else {
                resolve(createEnvironmentData);
            }
        });
    });
}

function uploadApplicationVersion(serviceContext) {
    //Get artifact_path
        //If file, just upload directly
        //If directory, zip directory up and upload
    return new Promise((resolve, reject) => {
        var applicationPath = serviceContext.params.application_path;

        if(!fs.existsSync(applicationPath)) {
            reject(new Error(`Artifact path not valid: ${applicationPath}`))
        }

        let fileToUpload = applicationPath;
        if(fs.lstatSync(applicationPath).isDirectory()) { //Zip directory up into file 
            fileToUpload = `/tmp/zipped-deploy-file-${new Date().getTime()}.zip`;
            util.zipDirectoryToFile(applicationPath, fileToUpload);
        }

        console.log("Zipped file");
        resolve();

        // let uploadApplicationParams = {

        // }
    });
}

function updateEnvironment() {

}

function getServiceRoleForEnvironment(dependenciesServiceContexts) {
    //TODO
    //Include injected services 
    //Include access to S3 secrets bucket   
}

function getEnvVarsForEnvironment(dependenciesServiceContexts) {
    //TODO
}

function storeSecretsForEnvironment(dependenciesServiceContexts) {
    //Make sure bucket and paths exist
    //Store secrets
    //Return policy for secrets bucket?
}


exports.check = function() {
    console.log("Check Beanstalk -- NOT IMPLEMENTED");
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
exports.deploy = function(serviceContext,  dependenciesServiceContexts) {
    console.log("Deploying beanstalk service: " + serviceContext.name);

    let applicationName = `${serviceContext.appName}_${serviceContext.environmentName}_${serviceContext.name}`
    return createApplicationIfNotExists(applicationName)
        .then(applicationData => {
            //Create application Version
            uploadApplicationVersion(serviceContext)
                .then(() => {
                    console.log("UPLOADED APPLICATION VERSION!");
                });
        })
        .then(applicationData => {
            getEnvironment(applicationName)
                .then(environmentData => {
                    return "";
                    // if(!environmentData) { //Create
                    //     return createEnvironment(dependenciesServiceContexts);
                    // }
                    // else { //Update
                    //     return updateEnvironment(dependenciesServiceContexts);
                    // }
                })
                .then(environmentData => {
                    return "";
                });
        });
}