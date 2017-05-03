const winston = require('winston');
const _ = require('lodash');
const ConsumeEventsContext = require('../datatypes/consume-events-context');
const util = require('../util/util');
const Promise = require('bluebird');

function consumeInternalEvents(serviceDeployers, environmentContext, deployContexts) {
    let consumeEventActions = [];
    let consumeEventsContexts = {};

    winston.info(`Consuming internal events (if any) for services`);

    _.forEach(environmentContext.serviceContexts, function(producerServiceContext, producerServiceName) {
        if(producerServiceContext.params.event_consumers) { //Only look at those services producing events
            _.forEach(producerServiceContext.params.event_consumers, function(consumerService) {
                let consumerServiceName = consumerService.service_name;

                if(!consumerServiceName.startsWith('https://')) { //Don't look at external service references
                    let consumerServiceContext = environmentContext.serviceContexts[consumerServiceName];
                    consumeEventActions.push({
                        consumerServiceContext,
                        consumerDeployContext: deployContexts[consumerServiceName],
                        consumerServiceDeployer: serviceDeployers[consumerServiceContext.serviceType],
                        producerServiceContext,
                        producerDeployContext: deployContexts[producerServiceName]
                    });
                }
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

function consumeExternalEvents(serviceDeployers, environmentContext, deployContexts) {
    let externalConsumeEventActions = [];
    let externalConsumeEventsContexts = {};

    winston.info(`Consuming external events (if any) for services`);
    _.forEach(environmentContext.serviceContexts, function(consumerServiceContext, consumerServiceName) {
        if(consumerServiceContext.params.external_event_producers) { //Consume events from external service
            let consumerDeployContext = deployContexts[consumerServiceName];
            let serviceDeployer = serviceDeployers[consumerServiceContext.serviceType];

            for(let externalServiceName of consumerServiceContext.params.external_event_producers) {
                externalConsumeEventActions.push({
                    consumerServiceContext: consumerServiceContext,
                    consumerDeployContext: consumerDeployContext,
                    externalServiceName: externalServiceName,
                    serviceDeployer: serviceDeployer
                });
            }
        }
    });

    return Promise.mapSeries(externalConsumeEventActions, externalEventAction => {
        let consumerServiceContext = externalEventAction.consumerServiceContext;
        let consumerDeployContext = externalEventAction.consumerDeployContext;
        let externalServiceName = externalEventAction.externalServiceName;
        let serviceDeployer = externalEventAction.serviceDeployer;

        let consumeEventsContextName = util.getConsumeEventsContextName(consumerServiceContext.serviceName, externalServiceName);
        winston.info(`Consuming events from external service ${consumeEventsContextName}`);
        return util.getExternalServiceContext(externalServiceName, "1")
            .then(externalServiceContext => {
                let externalServiceDeployer = serviceDeployers[externalServiceContext.serviceType];
                return externalServiceDeployer.getDeployContextForExternalRef(externalServiceContext)
                    .then(externalDeployContext => {
                        return serviceDeployer.consumeEvents(consumerServiceContext, consumerDeployContext, externalServiceContext, externalDeployContext)
                    });
            })
            .then(consumeEventsContext => {
                if(!(consumeEventsContext instanceof ConsumeEventsContext)) {
                    throw new Error("Expected ConsumeEventsContext back from 'consumeEvents' phase of service deployer");
                }
                externalConsumeEventsContexts[consumeEventsContextName] = consumeEventsContext;
            });
    })
    .then(() => {
        return externalConsumeEventsContexts; //This was built-up dynamically above
    });
}

exports.consumeEvents = function(serviceDeployers, environmentContext, deployContexts) {
    winston.info(`Executing consume events phase on services in environment ${environmentContext.environmentName}`);

    return consumeInternalEvents(serviceDeployers, environmentContext, deployContexts)
        .then(internalConsumeEventsContexts => {
            return consumeExternalEvents(serviceDeployers, environmentContext, deployContexts)
                .then(externalConsumeEventsContexts => {
                    return _.assign(internalConsumeEventsContexts, externalConsumeEventsContexts);
                });
        });
}