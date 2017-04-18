const winston = require('winston');
const _ = require('lodash');
const ConsumeEventsContext = require('../datatypes/consume-events-context');
const util = require('../util/util');

function consumeInternalEvents(serviceDeployers, environmentContext, deployContexts) {
    let consumePromises = [];
    let consumeEventsContexts = {};

    _.forEach(environmentContext.serviceContexts, function(producerServiceContext, producerServiceName) {
        if(producerServiceContext.params.event_consumers) {
            _.forEach(producerServiceContext.params.event_consumers, function(consumerService) {
                let consumerServiceName = consumerService.service_name;

                if(!consumerServiceName.startsWith('https://')) { //Don't look at external service references
                    //Get deploy info for producer service
                    let producerDeployContext = deployContexts[producerServiceName];
                    
                    //Get deploy info for consumer service
                    
                    let consumerServiceContext = environmentContext.serviceContexts[consumerServiceName];
                    let consumerDeployContext = deployContexts[consumerServiceName];
                    let consumerServiceDeployer = serviceDeployers[consumerServiceContext.serviceType];
                    
                    //Execute consume on consumer service
                    let consumeEventsContextName = util.getConsumeEventsContextName(consumerServiceName, producerServiceName);
                    winston.info(`Consuming events from service ${consumeEventsContextName}`);
                    let consumePromise = consumerServiceDeployer.consumeEvents(consumerServiceContext, consumerDeployContext, producerServiceContext, producerDeployContext)
                        .then(consumeEventsContext => {
                            if(!(consumeEventsContext instanceof ConsumeEventsContext)) {
                                throw new Error("Expected ConsumeEventsContext back from 'consumeEvents' phase of service deployer");
                            }
                            consumeEventsContexts[consumeEventsContextName] = consumeEventsContext;
                        });
                    consumePromises.push(consumePromise);
                }
            });
        }
    });

    return Promise.all(consumePromises)
        .then(() => {
            return consumeEventsContexts; //This was built-up dynamically above
        });
}

function consumeExternalEvents(serviceDeployers, environmentContext, deployContexts) {
    let externalConsumePromises = [];
    let externalConsumeEventsContexts = {};

    _.forEach(environmentContext.serviceContexts, function(consumerServiceContext, consumerServiceName) {
        if(consumerServiceContext.params.external_event_producers) { //Consume events from external service
            let consumerDeployContext = deployContexts[consumerServiceName];
            let serviceDeployer = serviceDeployers[consumerServiceContext.serviceType];

            for(let externalServiceName of consumerServiceContext.params.external_event_producers) {
                let consumeEventsContextName = util.getConsumeEventsContextName(consumerServiceName, externalServiceName);
                winston.info(`Consuming events from external service ${consumeEventsContextName}`);
                let externalConsumePromise = util.getExternalServiceContext(externalServiceName, "1")
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
                
                externalConsumePromises.push(externalConsumePromise);
            }
        }
    });

    return Promise.all(externalConsumePromises)
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