const ServiceContext = require('../../lib/datatypes/service-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const UnDeployContext = require('../../lib/datatypes/un-deploy-context');
const deployersCommon = require('../../lib/services/deployers-common');
const iamCalls = require('../../lib/aws/iam-calls');
const s3Calls = require('../../lib/aws/s3-calls');
const cloudformationCalls = require('../../lib/aws/cloudformation-calls');
const util = require('../../lib/util/util');
const ec2Calls = require('../../lib/aws/ec2-calls');
const fs = require('fs');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('deployers-common', function () {
    let sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('getInjectedEnvVarName', function () {
        it('should return the environment variable name from the given ServiceContext and suffix', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let envVarName = deployersCommon.getInjectedEnvVarName(serviceContext, "SOME_INFO");
            expect(envVarName).to.equal("FAKETYPE_FAKEAPP_FAKEENV_FAKESERVICE_SOME_INFO");
        });
    });

    describe('getEnvVarsFromServiceContext', function () {
        it('should return an object with the env vars to inject from the service context', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let serviceName = "FakeService";
            let deployVersion = "1";
            let serviceContext = new ServiceContext(appName, envName, serviceName, "apigateway", deployVersion, {});
            let returnEnvVars = deployersCommon.getEnvVarsFromServiceContext(serviceContext);
            expect(returnEnvVars['HANDEL_APP_NAME']).to.equal(appName);
            expect(returnEnvVars['HANDEL_ENVIRONMENT_NAME']).to.equal(envName);
            expect(returnEnvVars['HANDEL_SERVICE_NAME']).to.equal(serviceName);
            expect(returnEnvVars['HANDEL_SERVICE_VERSION']).to.equal(deployVersion);
        });
    });

    describe('getEnvVarsFromDependencyDeployContexts', function () {
        it('should return an object with the env vars from all given DeployContexts', function () {
            let deployContexts = []
            let serviceContext1 = new ServiceContext("FakeApp", "FakeEnv", "FakeService1", "FakeType1", "1", {});
            let deployContext1 = new DeployContext(serviceContext1);
            let envVarName1 = "ENV_VAR_1";
            let envVarValue1 = "someValue1";
            deployContext1.environmentVariables[envVarName1] = envVarValue1;
            deployContexts.push(deployContext1);

            let serviceContext2 = new ServiceContext("FakeApp", "FakeEnv", "FakeService2", "FakeType2", "1", {});
            let deployContext2 = new DeployContext(serviceContext2);
            let envVarName2 = "ENV_VAR_2";
            let envVarValue2 = "someValue2";
            deployContext2.environmentVariables[envVarName2] = envVarValue2;
            deployContexts.push(deployContext2);

            let returnVars = deployersCommon.getEnvVarsFromDependencyDeployContexts(deployContexts);

            expect(returnVars[envVarName1]).to.equal(envVarValue1);
            expect(returnVars[envVarName2]).to.equal(envVarValue2);
        });
    });

    describe('createCustomRole', function () {
        it('should create the role if it doesnt exist', function () {
            let createRoleStub = sandbox.stub(iamCalls, 'createRoleIfNotExists').returns(Promise.resolve({}));
            let createOrUpdatePolicy = sandbox.stub(iamCalls, 'createOrUpdatePolicy').returns(Promise.resolve({
                Arn: "FakeArn"
            }));
            let attachPolicyStub = sandbox.stub(iamCalls, 'attachPolicyToRole').returns(Promise.resolve({}));
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({}));

            return deployersCommon.createCustomRole("ecs.amazonaws.com", "MyRole", [{}])
                .then(role => {
                    expect(createRoleStub.calledOnce).to.be.true;
                    expect(createOrUpdatePolicy.calledOnce).to.be.true;
                    expect(attachPolicyStub.calledOnce).to.be.true;
                    expect(getRoleStub.calledOnce).to.be.true;
                });
        });

        it('should create a role with no policies if it doesnt exist', function () {
            let createRoleStub = sandbox.stub(iamCalls, 'createRoleIfNotExists').returns(Promise.resolve({}));
            let createOrUpdatePolicy = sandbox.stub(iamCalls, 'createOrUpdatePolicy').returns(Promise.resolve({}));
            let attachPolicyStub = sandbox.stub(iamCalls, 'attachPolicyToRole').returns(Promise.resolve({}));
            let getRoleStub = sandbox.stub(iamCalls, 'getRole').returns(Promise.resolve({}));

            return deployersCommon.createCustomRole("ecs.amazonaws.com", "MyRole", [])
                .then(role => {
                    expect(createRoleStub.calledOnce).to.be.true;
                    expect(createOrUpdatePolicy.notCalled).to.be.true;
                    expect(attachPolicyStub.notCalled).to.be.true;
                    expect(getRoleStub.calledOnce).to.be.true;
                });
        });
    });

    describe('getAllPolicyStatementsForServiceRole', function () {
        it('should return the combination of policy statements from the own service and its dependencies', function () {
            let ownServicePolicyStatements = [{
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": [
                    "arn:aws:logs:*:*:*"
                ]
            }];

            let dependenciesDeployContexts = [];
            let dependencyServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "sqs", "1", {});
            let dependencyDeployContext = new DeployContext(dependencyServiceContext);
            dependencyDeployContext.policies.push({
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
                    "SomeQueueArn"
                ]
            });
            dependenciesDeployContexts.push(dependencyDeployContext);
            
            let policyStatements = deployersCommon.getAllPolicyStatementsForServiceRole(ownServicePolicyStatements, dependenciesDeployContexts);
            expect(policyStatements.length).to.equal(2);
        });
    });

    describe('createSecurityGroupForService', function () {
        it('should create the security group when it doesnt exist', function () {
            let sgName = "FakeSg";

            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "GroupId",
                    OutputValue: "SomeId"
                }]
            }))
            let getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').returns(Promise.resolve({}));

            return deployersCommon.createSecurityGroupForService(sgName, true)
                .then(securityGroup => {
                    expect(securityGroup).to.deep.equal({});
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                    expect(getSecurityGroupByIdStub.calledOnce).to.be.true;
                });
        });

        it('should update the security group when it exists', function() {
            let sgName = "FakeSg";

            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "GroupId",
                    OutputValue: "SomeId"
                }]
            }))
            let getSecurityGroupByIdStub = sandbox.stub(ec2Calls, 'getSecurityGroupById').returns(Promise.resolve({}));

            return deployersCommon.createSecurityGroupForService(sgName, true)
                .then(securityGroup => {
                    expect(securityGroup).to.deep.equal({});
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;
                    expect(getSecurityGroupByIdStub.calledOnce).to.be.true;
                });
        });
    });

    describe('unBindAllOnSg', function() {
        it('should remove all ingress from the given security group', function() {
            let removeIngressStub = sandbox.stub(ec2Calls, 'removeAllIngressFromSg').returns(Promise.resolve({}));

            return deployersCommon.unBindAllOnSg('FakeStack')
                .then(success => {
                    expect(success).to.be.true;
                    expect(removeIngressStub.calledOnce).to.be.true;
                });
        });
    });

    describe('deleteSecurityGroupForService', function() {
        it('should delete the stack if it exists', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            return deployersCommon.deleteSecurityGroupForService("FakeStack")
                .then(success => {
                    expect(success).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(deleteStackStub.calledOnce).to.be.true;
                });
        });

        it('should return true if the stack is already deleted', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            return deployersCommon.deleteSecurityGroupForService("FakeStack")
                .then(success => {
                    expect(success).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(deleteStackStub.notCalled).to.be.true;
                });
        })
    });

    describe('unDeployCloudFormationStack', function() {
        it('should delete the stack if it exists', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});
            return deployersCommon.unDeployCloudFormationStack(serviceContext, "DynamoDB")
                .then(unDeployContext  => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(deleteStackStub.calledOnce).to.be.true;
                });
        });

        it('should suceed even if the stack has been deleted', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let deleteStackStub = sandbox.stub(cloudformationCalls, 'deleteStack').returns(Promise.resolve(true));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});
            return deployersCommon.unDeployCloudFormationStack(serviceContext, "DynamoDB")
                .then(unDeployContext  => {
                    expect(unDeployContext).to.be.instanceof(UnDeployContext);
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(deleteStackStub.notCalled).to.be.true;
                });
        });
    })

    describe('getRoutingInformationForService', function () {
        it('should return null if no routing info defined in the given ServiceContext', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});

            let routingInfo = deployersCommon.getRoutingInformationForService(serviceContext);
            expect(routingInfo).to.be.null;
        })

        it('should return routing information when defined in the given ServiceContext', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                routing: {
                    type: 'https',
                    timeout: 59,
                    health_check_path: '/healthcheck/heartbeat',
                    https_certificate: 'SomeCert'
                }
            });

            let routingInfo = deployersCommon.getRoutingInformationForService(serviceContext);
            expect(routingInfo).to.not.be.null;
            expect(routingInfo.type).to.equal('https');
            expect(routingInfo.timeout).to.equal(59);
            expect(routingInfo.healthCheckPath).to.equal('/healthcheck/heartbeat');
            expect(routingInfo.httpsCertificate).to.contain('SomeCert');
        });
    });

    describe('uploadFileToHandelBucket', function () {
        it('should upload the given file to the bucket', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let diskFilePath = "FakePath";
            let s3FileName = "SomeFileName";

            //Stub out dependent services
            let createBucketStub = sandbox.stub(s3Calls, 'createBucketIfNotExists').returns(Promise.resolve({}));
            let uploadFileStub = sandbox.stub(s3Calls, 'uploadFile').returns({});
            let cleanupOldVersionsStub = sandbox.stub(s3Calls, 'cleanupOldVersionsOfFiles').returns(Promise.resolve(null));

            return deployersCommon.uploadFileToHandelBucket(serviceContext, diskFilePath, s3FileName)
                .then(s3ObjectInfo => {
                    expect(createBucketStub.calledOnce).to.be.true;
                    expect(uploadFileStub.calledOnce).to.be.true;
                    expect(cleanupOldVersionsStub.calledOnce).to.be.true;
                    expect(s3ObjectInfo).to.deep.equal({});
                });
        });
    });

    describe('uploadDeployableArtifactToHandelBucket', function () {
        it('should upload a file to the given s3 location', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: `${__dirname}/mytestartifact.war`
            });
            let s3FileName = "FakeS3Filename";

            let uploadFileToHandelBucketStub = sandbox.stub(deployersCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({}));

            return deployersCommon.uploadDeployableArtifactToHandelBucket(serviceContext, s3FileName)
                .then(s3ObjectInfo => {
                    expect(uploadFileToHandelBucketStub.calledOnce).to.be.true;
                    expect(s3ObjectInfo).to.deep.equal({});
                });
        });

        it('should zip and upload a directory to the given s3 location', function () {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {
                path_to_code: __dirname
            });
            let s3FileName = "FakeS3Filename";

            let zipDirectoryToFileStub = sandbox.stub(util, 'zipDirectoryToFile').returns(Promise.resolve({}));
            let uploadFileToHandelBucketStub = sandbox.stub(deployersCommon, 'uploadFileToHandelBucket').returns(Promise.resolve({}));
            let unlinkSyncStub = sandbox.stub(fs, 'unlinkSync').returns(null);

            return deployersCommon.uploadDeployableArtifactToHandelBucket(serviceContext, s3FileName)
                .then(s3ObjectInfo => {
                    expect(zipDirectoryToFileStub.calledOnce).to.be.true;
                    expect(uploadFileToHandelBucketStub.calledOnce).to.be.true;
                    expect(unlinkSyncStub.calledOnce).to.be.true;
                    expect(s3ObjectInfo).to.deep.equal({});
                });
        });
    });

    describe('getAppSecretsAccessPolicyStatements', function () {
        it('should return an array of two permissions allowing it to access secrets in its namespace', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let serviceName = "FakeService";
            let serviceContext = new ServiceContext(appName, envName, serviceName, "lambda", "1", {});
            let policyStatements = deployersCommon.getAppSecretsAccessPolicyStatements(serviceContext);
            expect(policyStatements.length).to.equal(2);
            expect(policyStatements[1].Resource[0]).to.contain(`parameter/${appName}*`)
        });
    });

    describe('getEventConsumerConfigParams', function () {
        it('should return the config for the consumer from the producer', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let consumerServiceName = "ConsumerServiceName";
            let consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, "lambda", deployVersion, {

            });
            let producerServiceName = "ProducerServiceName";
            let eventInputVal = '{"notify": false}';
            let producerServiceContext = new ServiceContext(appName, envName, producerServiceName, "cloudwatchevent", deployVersion, {
                event_consumers: [{
                    service_name: consumerServiceName,
                    event_input: eventInputVal
                }]
            });

            let eventConsumerConfig = deployersCommon.getEventConsumerConfigParams(producerServiceContext, consumerServiceContext);
            expect(eventConsumerConfig).to.not.be.null;
            expect(eventConsumerConfig.event_input).to.equal(eventInputVal);
        });

        it('should return null when no config exists in the producer for the consumer', function () {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let consumerServiceName = "ConsumerServiceName";
            let consumerServiceContext = new ServiceContext(appName, envName, consumerServiceName, "lambda", deployVersion, {

            });
            let producerServiceName = "ProducerServiceName";
            let producerServiceContext = new ServiceContext(appName, envName, producerServiceName, "cloudwatchevent", deployVersion, {
                event_consumers: []
            });

            let eventConsumerConfig = deployersCommon.getEventConsumerConfigParams(producerServiceContext, consumerServiceContext);
            expect(eventConsumerConfig).to.be.null;
        });
    });
});