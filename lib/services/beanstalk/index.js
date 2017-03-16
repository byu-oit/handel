// const AWS = require('aws-sdk');
// const winston = require('winston');
// const fs = require('fs');
// const util = require('../../util/util');
// const PreDeployContext = require('../../datatypes/pre-deploy-context');
// const BindContext = require('../../datatypes/bind-context');
// const DeployContext = require('../../datatypes/deploy-context');
// const beanstalk = new AWS.ElasticBeanstalk({
//     apiVersion: '2010-12-01'
// });

// function getApplication(applicationName) {
//     return new Promise((resolve, reject) => {
//         let describeApplicationParams = {
//             ApplicationNames: [ applicationName ]
//         }
//         beanstalk.describeApplications(describeApplicationParams, function(err, applicationData) {
//             if(err) { 
//                 reject(err) 
//             }
//             else {
//                 if(applicationData.Applications.length > 0) {
//                     resolve(applicationData.Applications[0]);
//                 }
//                 else {
//                     resolve(null);
//                 }
//             }
//         })
//     });
// }

// function getEnvironment(applicationName) {
//     return new Promise((resolve, reject) => {
//         let describeEnvironmentsParams = {
//             ApplicationName: [ applicationName ]
//         }
//         beanstalk.describeEnvironments(describeEnvironmentsParams, function(err, describeEnvironmentsData) {
//             if(err) { reject(err); }
//             else {
//                 if(describeEnvironmentsData.Environments.length > 0) {
//                     //This assumes there is only ever one environment per application. If we implement
//                     //  a/b deploys, then this will have to change to be smarter
//                     resolve(describeEnvironmentsData.Environments[0]);
//                 }
//                 else {
//                     resolve(null);
//                 }
//             }   
//         });
//     });
// }

// function createApplication(applicationName) {
//     return new Promise((resolve, reject) => {
//         winston.info(`Creating application ${applicationName}`);
//         let createApplicationParams = {
//             ApplicationName: applicationName,
//             Description: applicationName 
//             //TODO - IMPLEMENT RESOURCE LIFECYCLE CONFIG
//         }
//         beanstalk.createApplication(createApplicationParams, function(err, createApplicationData) {
//             if (err) { reject(err); }
//             else {
//                 winston.info(`Created application ${applicationName}`);
//                 resolve(createApplicationData);
//             }
//         });
//     });
// }

// function createApplicationIfNotExists(applicationName) {
//     return getApplication(applicationName)
//         .then(applicationData => {
//             if(applicationData) { //Already exists
//                 winston.info(`Application ${applicationName} already exists`)
//                 return applicationData;
//             }
//             else { //Application doesn't exist, so create it
//                 return createApplication(applicationName)
//                     .then(() => {
//                         return getApplication(applicationName)
//                             .then(createdApplicationData => {
//                                 return createdApplicationData;
//                             })
//                     })
//             }
//         });
// }

// function createEnvironment(applicationName, serviceContext) {
//     //TODO - NEED TO PROBABLY CREATE AN ENVIRONMENT CONFIG
//         //IS THIS HOW WE INJECT THINGS LIKE IAM ROLES?

//     return new Promise((resolve, reject) => {
//         let createEnvironmentParams = {
//             ApplicationName: applicationName,
//             EnvironmentName: applicationName,
//             SolutionStackName: serviceContext.params.solution_stack,
//             VersionLabel: "", //TODO - NEED TO UPLOAD AND HAVE AN APPLICATION VERSION
//             Tier: {
//                 Name: "WebServer",
//                 Type: "Standard",
//                 Version: " "
//             }
//             //TODO - TAGS
//         };

//         beanstalk.createEnvironment(createEnvironmentParams, function(err, createEnvironmentData) {
//             if (err) { reject(err) }
//             else {
//                 resolve(createEnvironmentData);
//             }
//         });
//     });
// }

// function uploadApplicationVersion(serviceContext) {
//     //Get artifact_path
//         //If file, just upload directly
//         //If directory, zip directory up and upload
//     return new Promise((resolve, reject) => {
//         var applicationPath = serviceContext.params.application_path;

//         if(!fs.existsSync(applicationPath)) {
//             reject(new Error(`Artifact path not valid: ${applicationPath}`))
//         }

//         let fileToUpload = applicationPath;
//         if(fs.lstatSync(applicationPath).isDirectory()) { //Zip directory up into file 
//             fileToUpload = `/tmp/zipped-deploy-file-${new Date().getTime()}.zip`;
//             util.zipDirectoryToFile(applicationPath, fileToUpload);
//         }

//         console.log("Zipped file");
//         resolve();

//         // let uploadApplicationParams = {

//         // }
//     });
// }

// function updateEnvironment() {

// }

// function getServiceRoleForEnvironment(dependenciesServiceContexts) {
//     //TODO
//     //Include injected services 
//     //Include access to S3 secrets bucket   
// }

// function getEnvVarsForEnvironment(dependenciesServiceContexts) {
//     //TODO
// }

// function storeSecretsForEnvironment(dependenciesServiceContexts) {
//     //Make sure bucket and paths exist
//     //Store secrets
//     //Return policy for secrets bucket?
// }


// /**
//  * Checks the given service for required parameters and correctness. This provides
//  * a fail-fast mechanism for configuration errors before deploy is attempted.
//  *
//  * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
//  * @returns {Array} - 0 or more String error messages
//  */
// exports.check = function() {
//     throw new Error("Check Beanstalk -- NOT IMPLEMENTED");
// }


// /**
//  * Create resources needed for deployment that are also needed for dependency wiring
//  * with other services
//  *
//  * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
//  * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the pre-deploy
//  */
// exports.preDeploy = function(serviceContext) {
//     throw new Error("PreDeploy Beanstalk -- NOT IMPLEMENTED");
// }


// /**
//  * Bind two resources from PreDeploy together by performing some wiring action on them. An example * is to add an ingress rule from one security group onto another. Wiring actions may also be
//  * performed in the Deploy phase if there isn't a two-way linkage. For example, security groups
//  * probably need to be done in PreDeploy and Bind, but environment variables from one service to
//  * another can just be done in Deploy
//  *
//  * Bind is run from the perspective of the service being consumed, not the other way around.
//  *
//  * Do not use this phase for creating resources. Those should be done either in PreDeploy or Deploy.
//  * This phase is for wiring up existing resources from PreDeploy
//  *
//  * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being consumed
//  * @param {PreDeployContext} ownPreDeployContext - The PreDeployContext of the service being consumed
//  * @param {ServiceContext} dependentOfServiceContext - The ServiceContext of the service consuming this one
//  * @param {PreDeployContext} dependentOfPreDeployContext - The PreDeployContext of the service consuming this one
//  * @returns {Promise.<BindContext>} - A Promise of the BindContext results from the Bind
//  */
// exports.bind = function(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
//     throw new Error("Bind Beanstalk -- NOT IMPLEMENTED");
// }


// /**
//  * Deploy the given resource, wiring it up with results from the DeployContexts of services
//  * that this one depends on. All dependencies are guaranteed to be deployed before the ones
//  * consuming them
//  *
//  * @param {ServiceContext} ownServiceContext - The ServiceContext of the service being deployed
//  * @param {PreDeployContext} ownPreDeployContext - The PreDeployContext of the service being deployed
//  * @param {Array<DeployContext>} dependenciesDeployContexts - The DeployContexts of the services that this one depends on
//  * @returns {Promise.<DeployContext>} - A Promise of the DeployContext from this deploy
//  */
// exports.deploy = function(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
//     throw new Error("Deploy Beanstalk -- NOT IMPLEMENTED");

//     // console.log("Deploying beanstalk service: " + ownServiceContext.name);


//     // return Promise.resolve().then(() => {
//     //     console.log(dependenciesDeployContexts);
//     // });
    

//     // let applicationName = `${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.name}`
//     // return createApplicationIfNotExists(applicationName)
//     //     .then(applicationData => {
//     //         //Create application Version
//     //         uploadApplicationVersion(ownServiceContext)
//     //             .then(() => {
//     //                 console.log("UPLOADED APPLICATION VERSION!");
//     //             });
//     //     })
//     //     .then(applicationData => {
//     //         getEnvironment(applicationName)
//     //             .then(environmentData => {
//     //                 return "";
//     //                 // if(!environmentData) { //Create
//     //                 //     return createEnvironment(dependenciesServiceContexts);
//     //                 // }
//     //                 // else { //Update
//     //                 //     return updateEnvironment(dependenciesServiceContexts);
//     //                 // }
//     //             })
//     //             .then(environmentData => {
//     //                 return "";
//     //             });
//     //     });
// }