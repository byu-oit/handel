const winston = require('winston');
const _ = require('lodash');
const ConsumeEventsContext = require('../datatypes/consume-events-context');
const util = require('../util/util');
const Promise = require('bluebird');

exports.consumeEvents = function(serviceDeployers, environmentContext, deployContexts) {
    winston.info(`Executing consume events phase on services in environment ${environmentContext.environmentName}`);

    let consumeEventActions = [];
    let consumeEventsContexts = {};

    winston.info(`Consuming internal events (if any) for services`);

    _.forEach(environmentContext.serviceContexts, function(producerServiceContext, producerServiceName) {
        if(producerServiceContext.params.event_consumers) { //Only look at those services producing events
            _.forEach(producerServiceContext.params.event_consumers, function(consumerService) {
                let consumerServiceName = consumerService.service_name;

                let consumerServiceContext = environmentContext.serviceContexts[consumerServiceName];
                consumeEventActions.push({
                    consumerServiceContext,
                    consumerDeployContext: deployContexts[consumerServiceName],
                    consumerServiceDeployer: serviceDeployers[consumerServiceContext.serviceType],
                    producerServiceContext,
                    producerDeployContext: deployContexts[producerServiceName]
                });
            });
        }
    });

    return Promise.mapSeries(consumeEventActions, action => {
        let consumeEventsContextName = util.getConsumeEventsContextName(action.consumerServiceContext.serviceName, action.producerServiceContext.serviceName);
        winston.info(`Consuming events from internal service ${consumeEventsContextName}`);
        return action.consumerServiceDeployer.consumeEvents(action.consumerServiceContext, action.consumerDeployContext, action.producerServiceContext, action.producerDeployContext)
            .then(consumeEventsContext => {
                if(!(consumeEventsContext instanceof ConsumeEventsContext)) {
                    throw new Error("Expected ConsumeEventsContext back from 'consumeEvents' phase of service deployer");
                }

                consumeEventsContexts[consumeEventsContextName] = consumeEventsContext;
            });
    })
    .then(() => {
        return consumeEventsContexts; //This was built-up dynamically above
    });
}