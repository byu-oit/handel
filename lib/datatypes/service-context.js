class ServiceContext {
    constructor(appName, envName, serviceName,
                serviceType, deployVersion, params) {
            this.appName = appName;
            this.environmentName = envName;
            this.serviceName = serviceName;
            this.serviceType = serviceType;
            this.deployVersion = deployVersion;
            this.params = params;
    }
}

module.exports = exports = ServiceContext;
