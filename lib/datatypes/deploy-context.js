class DeployContext {
    constructor(serviceContext) {
        this.serviceName = serviceContext.serviceName,
        this.serviceType =  serviceContext.serviceType,
        this.policies = [], //Policies the consuming service can use when creating service roles in order to talk to this service
        this.credentials = [], //Items intended to be made securely available to the consuming service (via a secure S3 location)
        this.outputs = {}, //Items intended to be injected as environment variables into the consuming service
        this.scripts = [] //Scripts intended to be run on startup by the consuming resource. Some services like EFS require running commands on the host to connect them in
    }
}

module.exports = exports = DeployContext;
