const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const efs = require('../../../lib/services/efs');
const ec2Calls = require('../../../lib/aws/ec2-calls');
const cloudfFormationCalls = require('../../../lib/aws/cloudformation-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployersCommon = require('../../../lib/services/deployers-common');
const sinon = require('sinon');
const expect = require('chai').expect;

describe('efs deployer', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('check', function() {
        it('should require either max_io or general_purpose for the performance_mode parameter', function() {
            //Errors expected
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "efs", "1", {
                performance_mode: 'other_param'
            });
            let errors = efs.check(serviceContext);
            expect(errors.length).to.equal(1);
            expect(errors[0]).to.include("'performance_mode' parameter must be either");

            //No errors expected
            serviceContext.params.performance_mode = 'general_purpose';
            errors = efs.check(serviceContext);
            expect(errors.length).to.equal(0);

            //No errors expected            
            serviceContext.params.performance_mode = 'max_io';
            errors = efs.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function() {
        it('should create a security group', function () {
            let groupId = "FakeSgGroupId";
            let createSecurityGroupStub = sandbox.stub(deployersCommon, 'createSecurityGroupForService').returns(Promise.resolve({
                GroupId: groupId
            }));

            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return efs.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(createSecurityGroupStub.calledOnce).to.be.true;
                });
        });
    });

    describe('getPreDeployContextForExternalRef', function() {
        it('should return the PreDeployContext if preDeploy has been run', function() {
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});

            let groupId = "FakeSgGroupId";
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve({
                GroupId: groupId
            }));

            return efs.getPreDeployContextForExternalRef(externalServiceContext)
                .then(externalPreDeployContext => {
                    expect(externalPreDeployContext).to.be.instanceof(PreDeployContext);
                    expect(externalPreDeployContext.securityGroups.length).to.equal(1);
                    expect(externalPreDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                });
        });

        it('should return an error if PreDeploy hasnt been run yet', function() {
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve(null));

            return efs.getPreDeployContextForExternalRef(externalServiceContext)
                .then(externalPreDeployContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                    expect(err.message).to.contain('Resources from PreDeploy not found');
                });
        });
    });

    describe('bind', function() {
        it('should add the source sg to its own sg as an ingress rule', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "efs", deployVersion, {});
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });

            let dependentOfServiceContext = new ServiceContext(appName, envName, "FakeDependentOfService", "ecs", deployVersion, {});
            let dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            dependentOfPreDeployContext.securityGroups.push({
                GroupId: 'OtherId'
            });

            let addIngressRuleToSgIfNotExistsStub = sandbox.stub(ec2Calls, 'addIngressRuleToSgIfNotExists').returns(Promise.resolve({}));

            return efs.bind(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(addIngressRuleToSgIfNotExistsStub.calledOnce).to.be.true;
                });
        });
    });

    describe('getBindContextForExternalRef', function() {
        it('should return the BindContext when bind has already been run', function() {
            let externalServiceContext = new ServiceContext("FakeExternalApp", "FakeExternalEnv", "FakeExternalService", "efs", "1", {});
            let externalPreDeployContext = new PreDeployContext(externalServiceContext);
            externalPreDeployContext.securityGroups.push({
                GroupId: 'destGroup'
            })

            let dependentOfServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "ecs", "1", {});
            let dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            let dependentGroupId = "FakeGroupId";
            dependentOfPreDeployContext.securityGroups.push({
                GroupId: dependentGroupId,
            });
            
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve({}));
            let ingressRuleExistsStub = sandbox.stub(ec2Calls, 'ingressRuleExists').returns(true);

            return efs.getBindContextForExternalRef(externalServiceContext, externalPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                    expect(ingressRuleExistsStub.calledOnce).to.be.true;
                });
        });

        it('should return an error if bind hasnt already been run', function() {
            let externalServiceContext = new ServiceContext("FakeExternalApp", "FakeExternalEnv", "FakeExternalService", "efs", "1", {});
            let externalPreDeployContext = new PreDeployContext(externalServiceContext);
            externalPreDeployContext.securityGroups.push({
                GroupId: 'destGroup'
            })

            let dependentOfServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "ecs", "1", {});
            let dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            let dependentGroupId = "FakeGroupId";
            dependentOfPreDeployContext.securityGroups.push({
                GroupId: dependentGroupId,
            });
            
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve({}));
            let ingressRuleExistsStub = sandbox.stub(ec2Calls, 'ingressRuleExists').returns(false);

            return efs.getBindContextForExternalRef(externalServiceContext, externalPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                    expect(ingressRuleExistsStub.calledOnce).to.be.true;
                    expect(err.message).to.contain("Bind has not been run on external service");
                })
        });
    });

    describe('deploy', function() {
        it('should create the file system if it doesnt exist', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "efs", deployVersion, {});
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });
            let dependenciesDeployContexts = [];

            let fileSystemId = "FakeFileSystemId";
            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudfFormationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "EFSFileSystemId",
                    OutputValue: fileSystemId
                }]
            }));

            return efs.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.scripts.length).to.equal(1);
                });
        });

        it('should not update the file system if it already exists', function() {
            let appName = "FakeApp";
            let envName = "FakeEnv";
            let deployVersion = "1";
            let ownServiceContext = new ServiceContext(appName, envName, "FakeService", "efs", deployVersion, {});
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });
            let dependenciesDeployContexts = [];

            let fileSystemId = "FakeFileSystemId";
            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "EFSFileSystemId",
                    OutputValue: fileSystemId
                }]
            }));
            let createStackStub = sandbox.stub(cloudfFormationCalls, 'createStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: "EFSFileSystemId",
                    OutputValue: fileSystemId
                }]
            }));

            return efs.deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts)
                .then(deployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.notCalled).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                    expect(deployContext.scripts.length).to.equal(1);
                });
        });
    });

    describe('getDeployContextForExternalRef', function() {
        it('should return the DeployContext if the service has been deployed', function() {
            let externalServiceContext = new ServiceContext("FakeExternalApp", "FakeExternalEnv", "FakeExternalService", "efs", "1", {});
                
            let fileSystemId = "FakeFileSystem";
            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve({
                Outputs: [{
                    OutputKey: 'EFSFileSystemId',
                    OutputValue: fileSystemId
                }]
            }));

            return efs.getDeployContextForExternalRef(externalServiceContext)
                .then(externalDeployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(externalDeployContext).to.be.instanceof(DeployContext);
                    expect(externalDeployContext.scripts.length).to.equal(1);
                });
        });

        it('should return an error if the service has not been deployed yet', function() {
            let externalServiceContext = new ServiceContext("FakeExternalApp", "FakeExternalEnv", "FakeExternalService", "efs", "1", {});
            let getStackStub = sandbox.stub(cloudfFormationCalls, 'getStack').returns(Promise.resolve(null));

            return efs.getDeployContextForExternalRef(externalServiceContext)
                .then(externalDeployContext => {
                    expect(true).to.be.false; //Should not get here
                })
                .catch(err => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(err.message).to.contain('is not deployed!');
                })
        });
    });

    describe('consumerEvents', function() {
        it('should throw an error because EFS cant consume event services', function() {
            return efs.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("EFS service doesn't consume events");
                });
        });
    });

    describe('getConsumeEventsContextForExternalRef', function() {
        it('should throw an error because EFS cant consume event services', function() {
            return efs.getConsumeEventsContextForExternalRef(null, null, null, null)
                .then(externalConsumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("EFS service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function() {
        it('should throw an error because EFS cant produce events for other services', function() {
            return efs.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("EFS service doesn't produce events");
                });
        });
    });
});