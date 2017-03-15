const expect = require('chai').expect;
const AWS = require('aws-sdk-mock');
const ecsCalls = require('../../lib/aws/ecs-calls');

describe('ecs calls', function() {

    describe('registerTaskDefinition', function() {
        it('should register the task definition', function() {
            let taskDefinition = {
                family: 'FakeFamily',
                containerDefinitions: []
            }
            AWS.mock('ECS', 'registerTaskDefinition', Promise.resolve({
                taskDefinition: taskDefinition
            }));
            return ecsCalls.registerTaskDefinition(taskDefinition)
                .then(response => {
                    expect(response).to.deep.equal(taskDefinition);
                    AWS.restore('ECS');
                });
        });
    });
});