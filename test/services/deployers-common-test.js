const ServiceContext = require('../../lib/datatypes/service-context');
const DeployContext = require('../../lib/datatypes/deploy-context');
const deployersCommon = require('../../lib/services/deployers-common');
const iamCalls = require('../../lib/aws/iam-calls');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('deployers-common', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });


    describe('createCustomRoleForECSService', function() {
        it('should create the role from the given ServiceContext and DeployContexts of dependencies', function() {
            //Set up service being deployed
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let ownServiceName = "FakeConsumingService";
            let ownServiceType = "ecs";
            let deployVersion = "1";

            let consumedService1Name = "FakeConsumedService1";
            let consumedService2Name = "FakeConsumedService2";
            let ownServiceParams = {
                dependencies: [
                    consumedService1Name,
                    consumedService2Name
                ]
            }
            let ownServiceContext = new ServiceContext(appName, envName, ownServiceName, ownServiceType, deployVersion, ownServiceParams);
            
            //Set up DeployContexts of services being consumed
            let deployContexts = [];
            let consumedService1Type = "efs";
            let consumedService1Params = {};
            let consumedService1DeployContext = new DeployContext(new ServiceContext(appName, envName, consumedService1Name, consumedService1Type, deployVersion, consumedService1Params))
            let consumedService1Policy = {
                "Sid": `EFSAccess`,
                "Effect": "Allow",
                "Action": [
                    "efs:SomeAction",
                ],
                "Resource": [
                    "someArn"
                ]
            }
            consumedService1DeployContext.policies.push(consumedService1Policy);
            deployContexts.push(consumedService1DeployContext);
            

            let consumedService2Type = "dynamodb";
            let consumedService2Params = {};
            let consumedService2DeployContext = new DeployContext(new ServiceContext(appName, envName, consumedService2Name, consumedService2Type, deployVersion, consumedService2Params));
            let consumedService2Policy = {
                "Sid": `DynamoAccess`,
                "Effect": "Allow",
                "Action": [
                    "dynamodb:SomeAction",
                ],
                "Resource": [
                    "someArn"
                ]
            }
            consumedService2DeployContext.policies.push(consumedService2Policy);
            deployContexts.push(consumedService2DeployContext);

            //Stub out actual IAM calls
            let createRoleIfNotExistsStub = sandbox.stub(iamCalls, 'createRoleIfNotExists');
            createRoleIfNotExistsStub.returns(Promise.resolve({
                RoleName: "FakeRole"
            }));
            let createOrUpdatePolicyStub = sandbox.stub(iamCalls, 'createOrUpdatePolicy');
            createOrUpdatePolicyStub.returns(Promise.resolve({
                Arn: "FakeArn"
            }));
            let attachPolicyToRoleStub = sandbox.stub(iamCalls, 'attachPolicyToRole');
            attachPolicyToRoleStub.returns(Promise.resolve({}));
            let getRoleStub = sandbox.stub(iamCalls, 'getRole');
            getRoleStub.returns(Promise.resolve({
                RoleName: "FakeRole"
            }));

            return deployersCommon.createCustomRoleForService(ownServiceContext, deployContexts)
                .then(role => {
                    expect(role.RoleName).to.equal("FakeRole");
                    expect(createRoleIfNotExistsStub.calledOnce).to.be.true;
                    expect(createOrUpdatePolicyStub.calledOnce).to.be.true;
                    expect(attachPolicyToRoleStub.calledOnce).to.be.true;
                    expect(getRoleStub.calledOnce).to.be.true;
                });
        });
    });
});