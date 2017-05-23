const winston = require('winston');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../deployers-common');
const UnPreDeployContext = require('../../datatypes/un-pre-deploy-context');
const UnBindContext = require('../../datatypes/un-bind-context');
const handlebarsUtils = require('../../util/handlebars-utils');

const VERSIONING_PARAM_MAPPING = {
    enabled: 'Enabled',
    disabled: 'Suspended'
}

function getDeployContext(serviceContext, cfStack) {
    let bucketName = cloudFormationCalls.getOutput('BucketName', cfStack);
    let deployContext = new DeployContext(serviceContext);

    //Env variables to inject into consuming services
    let bucketNameEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'BUCKET_NAME');
    deployContext.environmentVariables[bucketNameEnv] = bucketName;
    let bucketUrlEnv = deployersCommon.getInjectedEnvVarName(serviceContext, "BUCKET_URL");
    deployContext.environmentVariables[bucketUrlEnv] = `https://${bucketName}.s3.amazonaws.com/`
    let regionEndpointEnv = deployersCommon.getInjectedEnvVarName(serviceContext, "REGION_ENDPOINT");
    deployContext.environmentVariables[regionEndpointEnv] = `s3-${accountConfig.region}.amazonaws.com`;

    //Need two policies for accessing S3. The first allows you to list the contents of the bucket,
    // and the second allows you to modify objects in that bucket
    deployContext.policies.push({
        "Effect": "Allow",
        "Action": [
            "s3:ListBucket"
        ],
        "Resource": [
            `arn:aws:s3:::${bucketName}`
        ]
    })
    deployContext.policies.push({
        "Effect": "Allow",
        "Action": [
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject"
        ],
        "Resource": [
            `arn:aws:s3:::${bucketName}/*`
        ]
    });

    return deployContext;
}


function getCompiledS3Template(stackName, ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    let bucketName = serviceParams.bucket_name || stackName;
    let versioningStatus = "Suspended";
    if (serviceParams.versioning) {
        versioningStatus = VERSIONING_PARAM_MAPPING[serviceParams.versioning];
    }

    let handlebarsParams = {
        bucketName: bucketName,
        versioningStatus: versioningStatus
    };

    //Inject tags (if any)
    if (serviceParams.tags) {
        handlebarsParams.tags = serviceParams.tags;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/s3-template.yml`, handlebarsParams)
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

exports.check = function (serviceContext) {
    let errors = [];

    let params = serviceContext.params;
    if (params.versioning && (params.versioning !== 'enabled' && params.versioning !== 'disabled')) {
        errors.push("S3 - 'versioning' parameter must be either 'enabled' or 'disabled'");
    }

    return errors;
}

exports.preDeploy = function (serviceContext) {
    winston.info(`S3 - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
}

exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`S3 - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
}

exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`S3 - Deploying S3 bucket ${stackName}`);

    return cloudFormationCalls.getStack(stackName)
        .then(stack => {
            return getCompiledS3Template(stackName, ownServiceContext)
                .then(compiledTemplate => {
                    if (!stack) { //Create
                        winston.info(`S3 - Creating S3 bucket ${stackName}`);
                        return cloudFormationCalls.createStack(stackName, compiledTemplate, []);
                    }
                    else {
                        winston.info(`S3 - Updating S3 bucket ${stackName}`);
                        return cloudFormationCalls.updateStack(stackName, compiledTemplate, []);
                    }
                });
        })

        .then(createdOrUpdatedStack => {
            winston.info(`S3 - Finished deploying S3 bucket ${stackName}`);
            return getDeployContext(ownServiceContext, createdOrUpdatedStack);
        });
}

exports.consumeEvents  =  function (ownServiceContext,  ownDeployContext,  producerServiceContext,  producerDeployContext)  {
        return  Promise.reject(new Error("The S3 service doesn't consume events from other services"));
}

exports.produceEvents  =  function (ownServiceContext,  ownDeployContext,  consumerServiceContext,  consumerDeployContext)  {
    return  Promise.reject(new Error("The S3 service doesn't currently produce events for other services"));
}

exports.unPreDeploy = function(ownServiceContext) {
    winston.info(`S3 - UnPreDeploy is not required for this service`);
    return Promise.resolve(new UnPreDeployContext(ownServiceContext));
}

exports.unBind = function(ownServiceContext) {
    winston.info(`S3 - UnBind is not required for this service`);
    return Promise.resolve(new UnBindContext(ownServiceContext));
}

exports.unDeploy = function (ownServiceContext) {
    return deployersCommon.unDeployCloudFormationStack(ownServiceContext, 'S3');
}

exports.producedEventsSupportedServices  =  []; //TODO - No events supported yet, but we will support some like Lambda

exports.producedDeployOutputTypes = [
    'environmentVariables',
    'policies'
];

exports.consumedDeployOutputTypes = [];
