const winston = require('winston');
const handlebarsUtils = require('../../util/handlebars-utils');
const PreDeployContext = require('../../datatypes/pre-deploy-context');
const BindContext = require('../../datatypes/bind-context');
const DeployContext = require('../../datatypes/deploy-context');
const accountConfig = require('../../util/account-config')().getAccountConfig();
const cloudFormationCalls = require('../../aws/cloudformation-calls');
const deployersCommon = require('../deployers-common');

function getCompiledSqsTemplate(stackName, serviceContext) {
    let serviceParams = serviceContext.params;
    let handlebarsParams = {
        queueName: stackName,
        delaySeconds: 0,
        maxMessageSize: 262144,
        messageRetentionPeriod: 345600,
        visibilityTimeout: 30
    };
    if (serviceParams.queue_type && serviceParams.queue_type === 'fifo') {
        handlebarsParams.queueName = `${stackName}.fifo`; //FIFO queues require special suffix in name
        handlebarsParams.fifoQueue = true;
        handlebarsParams.contentBasedDeduplication = false; //Default to false
        if (serviceParams.content_based_deduplication) {
            handlebarsParams.contentBasedDeduplication = serviceParams.content_based_deduplication
        }
    }
    if (serviceParams.delay_seconds) {
        handlebarsParams.delaySeconds = serviceParams.delay_seconds;
    }
    if (serviceParams.max_message_size) {
        handlebarsParams.maxMessageSize = serviceParams.max_message_size;
    }
    if (serviceParams.message_retention_period) {
        handlebarsParams.messageRetentionPeriod = serviceParams.message_retention_period;
    }
    if (serviceParams.visibility_timeout) {
        handlebarsParams.visibilityTimeout = serviceParams.visibility_timeout;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/sqs-template.yml`, handlebarsParams)
}

function getDeployContext(serviceContext, cfStack) {
    let queueName = cloudFormationCalls.getOutput('QueueName', cfStack);
    let queueArn = cloudFormationCalls.getOutput('QueueArn', cfStack);
    let queueUrl = cloudFormationCalls.getOutput('QueueUrl', cfStack);
    let deployContext = new DeployContext(serviceContext);

    //Env variables to inject into consuming services
    let queueNameEnv = deployersCommon.getInjectedEnvVarName(serviceContext, 'QUEUE_NAME');
    deployContext.environmentVariables[queueNameEnv] = queueName;
    let queueArnEnv = deployersCommon.getInjectedEnvVarName(serviceContext, "QUEUE_ARN");
    deployContext.environmentVariables[queueArnEnv] = queueArn;
    let queueUrlEnv = deployersCommon.getInjectedEnvVarName(serviceContext, "QUEUE_URL");
    deployContext.environmentVariables[queueUrlEnv] = queueUrl;

    //Policy to talk to this queue
    deployContext.policies.push({
        "Effect": "Allow",
        "Action": [
            "sqs:ChangeMessageVisibility",
            "sqs:ChangeMessageVisibilityBatch",
            "sqs:DeleteMessage",
            "sqs:DeleteMessageBatch",
            "sqs:GetQueueAttributes",
            "sqs:GetQueueUrl",
            "sqs:ListDeadLetterSourceQueues",
            "sqs:ListQueues",
            "sqs:PurgeQueue",
            "sqs:ReceiveMessage",
            "sqs:SendMessage",
            "sqs:SendMessageBatch"
        ],
        "Resource": [
            queueArn
        ]
    })

    return deployContext;
}


/**
 * Checks the given service for required parameters and correctness. This provides
 * a fail-fast mechanism for configuration errors before deploy is attempted.
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Array} - 0 or more String error messages
 */
exports.check = function (serviceContext) {
    let errors = [];
    return errors;
}


/**
 * Create resources needed for deployment that are also needed for dependency wiring
 * with other services
 *
 * @param {ServiceContext} serviceContext - The ServiceContext for the service to check
 * @returns {Promise.<PreDeployContext>} - A Promise of the PreDeployContext results from the pre-deploy
 */
exports.preDeploy = function (serviceContext) {
    winston.info(`SQS - PreDeploy is not required for this service, skipping it`);
    return Promise.resolve(new PreDeployContext(serviceContext));
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
exports.bind = function (ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext) {
    winston.info(`SQS - Bind is not required for this service, skipping it`);
    return Promise.resolve(new BindContext(ownServiceContext, dependentOfServiceContext));
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
exports.deploy = function (ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
    let stackName = deployersCommon.getResourceName(ownServiceContext);
    winston.info(`SQS - Executing Deploy on ${stackName}`);

    return getCompiledSqsTemplate(stackName, ownServiceContext)
        .then(sqsTemplate => {
            return cloudFormationCalls.getStack(stackName)
                .then(stack => {
                    if (!stack) {
                        winston.info(`SQS - Creating SQS queue ${stackName}`);
                        return cloudFormationCalls.createStack(stackName, sqsTemplate, []);
                    }
                    else {
                        winston.info(`SQS - Updating SQS queue ${stackName}`);
                        return cloudFormationCalls.updateStack(stackName, sqsTemplate, []);
                    }
                })
        })
        .then(deployedStack => {
            winston.info(`SQS - Finished deploying SQS queue ${stackName}`);
            return getDeployContext(ownServiceContext, deployedStack);
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
exports.consumeEvents  =  function (ownServiceContext,  ownDeployContext,  producerServiceContext,  producerDeployContext)  {
        return  Promise.reject(new Error("The SQS service doesn't consume events from other services"));
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
exports.produceEvents  =  function (ownServiceContext,  ownDeployContext,  consumerServiceContext,  consumerDeployContext)  {
        return  Promise.reject(new Error("The SQS service doesn't produce events for other services"));
}

/**
 * List of event sources this service can integrate with.
 * 
 * If the list is empty, this service cannot produce events to other services.
 */
exports.producedEventsSupportedServices  =  [];


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
