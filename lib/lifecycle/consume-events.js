const winston = require('winston');
const _ = require('lodash');
const ConsumeEventsContext = require('../datatypes/consume-events-context');
const util = require('../util/util');

exports.consumeEvents = function(serviceDeployers, environmentContext, deployContexts) {
    winston.info(`Executing consume events phase on services in environment ${environmentContext.environmentName}`);

    let consumePromises = [];
    let consumeEventsContexts = {};

    _.forEach(environmentContext.serviceContexts, function(producerServiceContext, producerServiceName) {
        if(producerServiceContext.params.event_consumers) {
            _.forEach(producerServiceContext.params.event_consumers, function(consumerService) {
                //Get deploy info for producer service
                let producerDeployContext = deployContexts[producerServiceName];
                
                //Get deploy info for consumer service
                let consumerServiceName = consumerService.service_name;
                let consumerServiceContext = environmentContext.serviceContexts[consumerServiceName];
                let consumerDeployContext = deployContexts[consumerServiceName];
                let consumerServiceDeployer = serviceDeployers[consumerServiceContext.serviceType];
                
                //Execute consume on consumer service
                let consumeEventsContextName = util.getConsumeEventsContextName(consumerServiceName, producerServiceName);
                winston.info(`Consuming events from services ${consumeEventsContextName}`);
                let consumePromise = consumerServiceDeployer.consumeEvents(consumerServiceContext, consumerDeployContext, producerServiceContext, producerDeployContext)
                    .then(consumeEventsContext => {
                        if(!(consumeEventsContext instanceof ConsumeEventsContext)) {
                            throw new Error("Expected ConsumeEventsContext back from 'consumeEvents' phase of service deployer");
                        }
                        consumeEventsContexts[consumeEventsContextName] = consumeEventsContext;
                    });
                consumePromises.push(consumePromise);
            });
        }
    });

    //Iterate through the services looking for //external_event_producers
        //If found, go read Handel file for that service
        //Get service and deploy context (fail if no deploy context)
        //Once found, consume just like regular ones above

    return Promise.all(consumePromises)
        .then(() => {
            return consumeEventsContexts; //This was built-up dynamically above
        });

}