const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const cloudWatchEventsCalls = require('../../lib/aws/cloudwatch-events-calls');
const sinon = require('sinon');

describe('cloudWatchEventsCalls', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('addTarget', function() {
        it('should add the requested target to the given rule', function() {
            AWS.mock('CloudWatchEvents', 'putTargets', Promise.resolve({}));
            
            let targetId = "FakeTargetId";
            return cloudWatchEventsCalls.addTarget("FakeRule", "FakeTargetArn", targetId, '{some: param}')
                .then(retTargetId => {
                    expect(retTargetId).to.equal(targetId);
                });
        });
    });
});