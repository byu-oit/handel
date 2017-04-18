const winston = require('winston');
const _ = require('lodash');
const ProduceEventsContext = require('../datatypes/produce-events-context');
const util = require('../util/util');


let produceInternalEvent = function(consumerServiceContext, consumerDeployContext, producerServiceContext, producerDeployContext, producerServiceDeployer) {
    return producerServiceDeployer.produceEvents(producerServiceContext, producerDeployContext, consumerServiceContext, consumerDeployContext)
        .then(produceEventsContext => {
            if(!(produceEventsContext instanceof ProduceEventsContext)) {
                throw new Error("Expected ProduceEventsContext back from 'produceEvents' phase of service deployer");
            }
            return produceEventsContext;
        });
}

let produceExternalEvent = function(producerServiceContext, producerDeployContext, externalServiceName, serviceDeployers) {
    let producerServiceDeployer = serviceDeployers[producerServiceContext.serviceType];

    return util.getExternalServiceContext(externalServiceName, "1") //We don't care about the version of external services
        .then(externalServiceContext => {
            let externalServiceDeployer = serviceDeployers[externalServiceContext.serviceType];
            return externalServiceDeployer.getDeployContextForExternalRef(externalServiceContext)
                .then(externalDeployContext => {
                    return externalServiceDeployer.getConsumeEventsContextForExternalRef(externalServiceContext, externalDeployContext, producerServiceContext, producerDeployContext)
                        .then(externalConsumeEventsContext => { //We don't use this, just need to make sure it ran
                            return externalDeployContext;
                        });
                })
                .then(externalDeployContext => {
                    return producerServiceDeployer.produceEvents(producerServiceContext, producerDeployContext, externalServiceContext, externalDeployContext)
                        .then(produceEventsContext => {
                            if(!(produceEventsContext instanceof ProduceEventsContext)) {
                                throw new Error("Expected ProduceEventsContext back from 'produceEvents' phase of service deployer");
                            }
                            return produceEventsContext;
                        });
                })
        });
}

exports.produceEvents = function(serviceDeployers, environmentContext, deployContexts) {
    winston.info(`Executing produce events phase on services in environment ${environmentContext.environmentName}`);

    let producePromises = [];
    let produceEventsContexts = {};

    _.forEach(environmentContext.serviceContexts, function(producerServiceContext, producerServiceName) {
        if(producerServiceContext.params.event_consumers) {
            _.forEach(producerServiceContext.params.event_consumers, function(consumerService) {
                //Get deploy info for producer service
                let producerDeployContext = deployContexts[producerServiceName];
                let producerServiceDeployer = serviceDeployers[producerServiceContext.serviceType];
                
                //Get deploy info for consumer service
                let consumerServiceName = consumerService.service_name;
                let produceEventsContextName = util.getProduceEventsContextName(producerServiceName, consumerServiceName);
                if(consumerServiceName.startsWith("https://")) { //External dependency
                    winston.info(`Producing events for external services ${produceEventsContextName}`);

                    let producePromise = produceExternalEvent(producerServiceContext, producerDeployContext, consumerServiceName, serviceDeployers)
                        .then(produceEventsContext => {
                            produceEventsContexts[produceEventsContextName] = produceEventsContext;
                        });
                    
                    producePromises.push(producePromise);
                }
                else { //Internal dependency
                    winston.info(`Producing events for services ${produceEventsContextName}`);

                    let consumerServiceContext = environmentContext.serviceContexts[consumerServiceName];
                    let consumerDeployContext = deployContexts[consumerServiceName];

                    let producePromise = produceInternalEvent(consumerServiceContext, consumerDeployContext, producerServiceContext, producerDeployContext, producerServiceDeployer)
                        .then(produceEventsContext => {
                            produceEventsContexts[produceEventsContextName] = produceEventsContext;
                        });

                    producePromises.push(producePromise);
                }
            });
        }
    });

    return Promise.all(producePromises)
        .then(() => {
            return produceEventsContexts; //This was built-up dynamically above
        });
}