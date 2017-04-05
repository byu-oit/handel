class EnvironmentContext {
    constructor(appName, deployVersion, environmentName) {
        this.appName = appName;
        this.deployVersion = deployVersion;
        this.environmentName = environmentName;
        this.serviceContexts = {};
    }
}

module.exports = exports = EnvironmentContext;