const winston = require('winston');
const _ = require('lodash');
const ProduceEventsContext = require('../datatypes/produce-events-context');
const util = require('../util/util');

exports.produceEvents = function(serviceDeployers, environmentContext, deployContexts) {
    winston.info(`Executing produce events phase on services in environment ${environmentContext.environmentName}`);

    let producePromises = [];
    let produceEventsContexts = {};

    _.forEach(environmentContext.serviceContexts, function(producerServiceContext, producerServiceName) {
        if(producerServiceContext.params.event_consumers) {
            _.forEach(producerServiceContext.params.event_consumers, function(consumerService) {
                //If consumer is an external URI
                    //Go read Handelfile and get service and deploy contexts
                    //If not allowed by consumer:
                        //Throw error
                    //Else, run produce as normal with outputted deploy and service contexts

                //Get deploy info for producer service
                let producerDeployContext = deployContexts[producerServiceName];
                let producerServiceDeployer = serviceDeployers[producerServiceContext.serviceType];
                
                //Get deploy info for consumer service
                let consumerServiceName = consumerService.service_name;
                let consumerServiceContext = environmentContext.serviceContexts[consumerServiceName];
                let consumerDeployContext = deployContexts[consumerServiceName];
                
                //Execute consume on consumer service
                let produceEventsContextName = util.getProduceEventsContextName(producerServiceName, consumerServiceName);
                winston.info(`Producing events for services ${produceEventsContextName}`);
                let producePromise = producerServiceDeployer.produceEvents(producerServiceContext, producerDeployContext, consumerServiceContext, consumerDeployContext)
                    .then(produceEventsContext => {
                        if(!(produceEventsContext instanceof ProduceEventsContext)) {
                            throw new Error("Expected ProduceEventsContext back from 'produceEvents' phase of service deployer");
                        }
                        produceEventsContexts[produceEventsContextName] = produceEventsContext;
                    });
                producePromises.push(producePromise);
            });
        }
    });

    return Promise.all(producePromises)
        .then(() => {
            return produceEventsContexts; //This was built-up dynamically above
        });

}