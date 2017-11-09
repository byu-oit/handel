/**
 * Given the stack name, returns the name of the Elasticache cluster
 * 
 * ElastiCache only allows for a 20-char max cluster name, which means we have to truncate our stack
 * name to fit in it.
 */
exports.getClusterName = function(serviceContext) {
    let appFragment = serviceContext.appName.substring(0, 9);
    let envFragement = serviceContext.environmentName.substring(0, 3);
    let serviceFragment = serviceContext.serviceName.substring(0, 6);
    return `${appFragment}-${envFragement}-${serviceFragment}`;
}