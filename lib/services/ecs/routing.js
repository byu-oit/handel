const accountConfig = require('../../common/account-config')().getAccountConfig();
const route53 = require('../../aws/route53-calls');

function getDefaultRouteContainer(containerConfigs) {
    for(let containerConfig of containerConfigs) {
        if(containerConfig.routingInfo) { //Just return the first one that has routing
            return containerConfig;
        }
    }
}

/**
 * Given a service context, this function returns a boolean that
 * tells whether one or more of the tasks specified in the user's
 * ECS configuration has load balancer routing configured for it.
 */
exports.oneOrMoreTasksHasRouting = function(ownServiceContext) {
    let serviceParams = ownServiceContext.params;

    for(let container of serviceParams.containers) {
        if(container.routing) {
            return true;
        }
    }
    return false;
}

exports.getRoutingInformationForContainer = function (container, albPriority, clusterName) {
    let routingInfo = {
        healthCheckPath: '/',
        basePath: '/',
        albPriority
    };
    if (container.routing.health_check_path) {
        routingInfo.healthCheckPath = container.routing.health_check_path;
    }
    if (container.routing.base_path) {
        routingInfo.basePath = container.routing.base_path;
    }

    //Wire up first port to Load Balancer
    routingInfo.containerPort = container.port_mappings[0].toString();

    //Configure the shortened ALB name (it has a limit of 32 chars)
    routingInfo.targetGroupName = `${clusterName.substring(0,27)}-${container.name.substring(0,4)}`;

    return routingInfo;
}

exports.getLoadBalancerConfig = function (serviceParams, containerConfigs, clusterName, hostedZones) {
    let defaultRouteContainer = getDefaultRouteContainer(containerConfigs);
    let loadBalancerConfig = { //Default values for load balancer
        timeout: 60,
        type: 'http',
        defaultRouteContainer
    }

    let loadBalancer = serviceParams.load_balancer;
    if (loadBalancer) {
        if (loadBalancer.timeout) {
            loadBalancerConfig.timeout = loadBalancer.timeout;
        }
        if (loadBalancer.type) {
            loadBalancerConfig.type = loadBalancer.type;
        }
        if (loadBalancer.https_certificate) {
            loadBalancerConfig.httpsCertificate = `arn:aws:acm:us-west-2:${accountConfig.account_id}:certificate/${loadBalancer.https_certificate}`;
        }
        if (loadBalancer.dns_names) {
            loadBalancerConfig.dnsNames = loadBalancer.dns_names.map(name => {
                return {
                    name: name,
                    zoneId: route53.getBestMatchingHostedZone(name, hostedZones).Id
                };
            });
        }
    }

    //Configure the shortened ALB name (it has a limit of 32 chars)
    loadBalancerConfig.albName = clusterName.substring(0,32);

    return loadBalancerConfig;
}

exports.checkLoadBalancerSection = function(serviceContext, serviceName, errors) {
    let params = serviceContext.params;
    if (params.load_balancer) {
        //Require the load balancer listener type
        if (!params.load_balancer.type) {
            errors.push(`${serviceName} - The 'type' parameter is required in the 'load_balancer' section`);
        }

        //If type = https, require https_certificate
        if (params.load_balancer.type === 'https' && !params.load_balancer.https_certificate) {
            errors.push(`${serviceName} - The 'https_certificate' parameter is required in the 'load_balancer' section when you use HTTPS`);
        }

        if (params.load_balancer.dns_names) {
            let badName = params.load_balancer.dns_names.some(name => !route53.isValidHostname(name));
            if (badName) {
                errors.push(`${serviceName} - The 'dns_names' values must be valid hostnames`)
            }
        }
    }
}