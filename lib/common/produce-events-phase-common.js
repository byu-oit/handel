exports.getEventConsumerConfig = function(serviceContext, eventConsumerServiceName) {
    for(let eventConsumer of serviceContext.params.event_consumers) {
        if(eventConsumer.service_name === eventConsumerServiceName) {
            return eventConsumer;
        }
    }
    return null;
}