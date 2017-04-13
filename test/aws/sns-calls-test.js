const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const snsCalls = require('../../lib/aws/sns-calls');
const sinon = require('sinon');

describe('snsCalls', function() {
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function() {
        sandbox.restore();
        AWS.restore('SNS');
    });

    describe('subscribeToTopic', function() {
        it('should subscribe to the topic', function() {
            let subscriptionArn = "FakeSubscriptionArn";
            AWS.mock('SNS', 'subscribe', Promise.resolve({
                SubscriptionArn: subscriptionArn
            }))

            return snsCalls.subscribeToTopic("FakeTopicArn", "lambda", "FakeLambdaArn")
                .then(response => {
                    expect(response).to.equal(subscriptionArn);
                });
        });
    });
});