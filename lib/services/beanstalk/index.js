
exports.check = function() {
    console.log("Check Beanstalk -- NOT IMPLEMENTED");
    return [];
}

/**
 * Deploy the instance of the service based on the service params passed in.
 * 
 * Parameters:
 * - Service context for the service to be deployed
 * - List of outputs from deployed service that this service depends on (if any)
 * 
 * Return a list of items for use by other services who depend on this one:
 *    {
 *      policies: [], //Policies the consuming service can use when creating service roles in order to talk to this service
 *      credentials: [], //Items intended to be made securely available to the consuming service (via a secure S3 location)
 *      outputs: [] //Items intended to be injected as environment variables into the consuming service
 *    }
 */
exports.deploy = function(serviceContext,  dependenciesServiceOutputs) {
    console.log("Deploying beanstalk service: " + serviceContext.name);

    return new Promise((resolve, reject) => { //TODO - NEED TO RETURN HERE
        setTimeout(function() {
            console.log("Finished beanstalk service deploy: " + serviceContext.name);
            
            var deployedServiceOutputs = {
                policies: [],
                credentials: [],
                params: ['SOME_ENV_VAR_FOR_BEANSTALK', 'ANOTHER_ENV_VAR_FOR_BEANSTALK']
            }
            serviceContext.deployedServiceOutputs = deployedServiceOutputs;
            resolve();

            //Else reject promise
        }, Math.random() * 1000 + 1000);
    });
}