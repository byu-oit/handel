class BindContext {
    constructor(serviceContext) {
        this.appName = serviceContext.appName,
        this.environmentName = serviceContext.environmentName,
        this.serviceName = serviceContext.serviceName,
        this.serviceType = serviceContext.serviceType
        //TODO - Need to know what goes here
    }
}

module.exports = exports = BindContext;
