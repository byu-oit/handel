const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const beanstalk = require('../../../lib/services/beanstalk');
const cloudformationCalls = require('../../../lib/aws/cloudformation-calls');
const ec2Calls = require('../../../lib/aws/ec2-calls');
const ServiceContext = require('../../../lib/datatypes/service-context');
const DeployContext = require('../../../lib/datatypes/deploy-context');
const PreDeployContext = require('../../../lib/datatypes/pre-deploy-context');
const BindContext = require('../../../lib/datatypes/bind-context');
const deployersCommon = require('../../../lib/services/deployers-common');
const sinon = require('sinon');
const expect = require('chai').expect;


describe('beanstalk deployer', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('check', function() {
        it('should check parameters for correctness', function() {
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let errors = beanstalk.check(serviceContext);
            expect(errors.length).to.equal(0);
        });
    });

    describe('preDeploy', function() {
        it('should create a security group and add self and SSH bastion ingress', function() {
            let groupId = "FakeSgGroupId";
            let createSecurityGroupStub = sandbox.stub(deployersCommon, 'createSecurityGroupForService').returns(Promise.resolve({
                GroupId: groupId
            }));
            
            let serviceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            return beanstalk.preDeploy(serviceContext)
                .then(preDeployContext => {
                    expect(preDeployContext).to.be.instanceof(PreDeployContext);
                    expect(preDeployContext.securityGroups.length).to.equal(1);
                    expect(preDeployContext.securityGroups[0].GroupId).to.equal(groupId);
                    expect(createSecurityGroupStub.calledOnce).to.be.true;
                });
        });
    });

    describe('getPreDeployContextForExternalRef', function() {
        it('should return the PreDeployContext if predeploy has been run for the service', function() {
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "lambda", "1", {});
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve({}));

            return beanstalk.getPreDeployContextForExternalRef(externalServiceContext)
                .then(externalPreDeployContext => {
                    expect(externalPreDeployContext).to.be.instanceof(PreDeployContext);
                    expect(externalPreDeployContext.securityGroups.length).to.equal(1);
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                });
        });

        it('should return an error if predeploy hasnt been run for the service yet', function() {
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "lambda", "1", {});
            let getSecurityGroupStub = sandbox.stub(ec2Calls, 'getSecurityGroup').returns(Promise.resolve(null));

            return beanstalk.getPreDeployContextForExternalRef(externalServiceContext)
                .then(externalPreDeployContext => {
                    expect(true).to.equal(false); //Should not get here
                })
                .catch(err => {
                    expect(getSecurityGroupStub.calledOnce).to.be.true;
                    expect(err.message).to.contain('Beanstalk - Resources from PreDeploy not found');
                });
        });
    })

    describe('bind', function() {
        it('should do nothing and just return an empty BindContext', function() {
            let ownServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "FakeType", "1", {});
            let ownPreDeployContext = new PreDeployContext(ownServiceContext);
            let dependentOfServiceContext = new ServiceContext("FakeApp", "FakeEnv", "OtherService", "OtherType", "1", {});
            let dependentOfPreDeployContext = new PreDeployContext(ownServiceContext);
            return beanstalk.bind(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext)
                .then(bindContext => {
                    expect(bindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('getBindContextForExternalRef', function() {
        it('should return an empty bind context', function() {
            return beanstalk.getBindContextForExternalRef(null, null, null, null)
                .then(externalBindContext => {
                    expect(externalBindContext).to.be.instanceof(BindContext);
                });
        });
    });

    describe('deploy', function() {
        function getServiceContext() {
            return new ServiceContext("FakeApp", "FakeEnv", "FakeService", "beanstalk", "1", {
                type: 'beanstalk',
                solution_stack: '64bit Amazon Linux 2016.09 v4.0.1 running Node.js',
                min_instances: 2,
                max_instances: 4,
                key_name: 'MyKey',
                instance_type: 't2.small'
            });
        }

        function getPreDeployContext(serviceContext, sgGroupId) {
            let ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: sgGroupId
            });
            return ownPreDeployContext;
        }

        it('should create the service if it doesnt exist', function() {
            let createCustomRoleForServiceStub = sandbox.stub(deployersCommon, 'createCustomRoleForService').returns(Promise.resolve({
                RoleName: "FakeRole"
            }));
            let createCustomRoleStub = sandbox.stub(deployersCommon, 'createCustomRole').returns(Promise.resolve({
                RoleName: "FakeServiceRole"
            }));
            let uploadDeployableArtifactToHandelBucketStub = sandbox.stub(deployersCommon, 'uploadDeployableArtifactToHandelBucket').returns(Promise.resolve({
                Bucket: "FakeBucket",
                Key: "FakeKey"
            }));
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let createStackStub = sandbox.stub(cloudformationCalls, 'createStack').returns(Promise.resolve({}));

            let ownServiceContext = getServiceContext();
            let sgGroupId = "FakeSgId";
            let ownPreDeployContext = getPreDeployContext(ownServiceContext, sgGroupId);

            return beanstalk.deploy(ownServiceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(uploadDeployableArtifactToHandelBucketStub.calledOnce).to.be.true;
                    expect(createCustomRoleForServiceStub.calledOnce).to.be.true;
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(createStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });

        it('should update the service if it doesnt exist', function() {
            let createCustomRoleForServiceStub = sandbox.stub(deployersCommon, 'createCustomRoleForService').returns(Promise.resolve({
                RoleName: "FakeRole"
            }));
            let createCustomRoleStub = sandbox.stub(deployersCommon, 'createCustomRole').returns(Promise.resolve({
                RoleName: "FakeServiceRole"
            }));
            let uploadDeployableArtifactToHandelBucketStub = sandbox.stub(deployersCommon, 'uploadDeployableArtifactToHandelBucket').returns(Promise.resolve({
                Bucket: "FakeBucket",
                Key: "FakeKey"
            }));
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let updateStackStub = sandbox.stub(cloudformationCalls, 'updateStack').returns(Promise.resolve({}));

            let ownServiceContext = getServiceContext();
            let sgGroupId = "FakeSgId";
            let ownPreDeployContext = getPreDeployContext(ownServiceContext, sgGroupId);

            return beanstalk.deploy(ownServiceContext, ownPreDeployContext, [])
                .then(deployContext => {
                    expect(uploadDeployableArtifactToHandelBucketStub.calledOnce).to.be.true;
                    expect(createCustomRoleForServiceStub.calledOnce).to.be.true;
                    expect(createCustomRoleStub.calledOnce).to.be.true;
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(updateStackStub.calledOnce).to.be.true;
                    expect(deployContext).to.be.instanceof(DeployContext);
                });
        });
    });

    describe('getDeployContextForExternalRef', function() {
        it('should return the DeployContext if the service has been deployed', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve({}));
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});            
            return beanstalk.getDeployContextForExternalRef(externalServiceContext)
                .then(externalDeployContext => {
                    expect(getStackStub.calledOnce).to.be.true;
                    expect(externalDeployContext).to.be.instanceof(DeployContext);
                });
        });

        it('should return an error if the service hasnt been deployed yet', function() {
            let getStackStub = sandbox.stub(cloudformationCalls, 'getStack').returns(Promise.resolve(null));
            let externalServiceContext = new ServiceContext("FakeApp", "FakeEnv", "FakeService", "dynamodb", "1", {});            
            return beanstalk.getDeployContextForExternalRef(externalServiceContext)
                .then(externalDeployContext => {
                    expect(true).to.equal(false); //Should not get here
                })
                .catch(err => {
                    expect(err.message).to.contain('is not deployed!');
                    expect(getStackStub.calledOnce).to.be.true;
                });
        });
    });

    describe('consumeEvents', function() {
        it('should throw an error because Beanstalk cant consume event services', function() {
            return beanstalk.consumeEvents(null, null, null, null)
                .then(consumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Beanstalk service doesn't consume events");
                });
        });
    });

    describe('getConsumeEventsContextForExternalRef', function() {
        it('should throw an error because Beanstalk cant consume event services', function() {
            return beanstalk.getConsumeEventsContextForExternalRef(null, null, null, null)
                .then(externalConsumeEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Beanstalk service doesn't consume events");
                });
        });
    });

    describe('produceEvents', function() {
        it('should throw an error because Beanstalk doesnt yet produce events for other services', function() {
            return beanstalk.produceEvents(null, null, null, null)
                .then(produceEventsContext => {
                    expect(true).to.be.false; //Shouldnt get here
                })
                .catch(err => {
                    expect(err.message).to.contain("Beanstalk service doesn't produce events");
                });
        });
    });
});