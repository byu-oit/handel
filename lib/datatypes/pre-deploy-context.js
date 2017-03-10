class PreDeployContext {
    constructor(serviceContext) {
        this.appName = serviceContext.appName,
        this.environmentName = serviceContext.environmentName,
        this.serviceName = serviceContext.serviceName,
        this.serviceType = serviceContext.serviceType,
        this.securityGroups = [] //Empty until service deployer fills it
    }
}

module.exports = exports = PreDeployContext;
