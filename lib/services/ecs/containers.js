const deployPhaseCommon = require('../../common/deploy-phase-common');
const routingSection = require('./routing');
const volumesSection = require('./volumes');
const _ = require('lodash');
const accountConfig = require('../../common/account-config')().getAccountConfig();

function serviceDefinitionHasContainer(serviceParams, containerName) {
    for (let container of serviceParams.containers) {
        if (container.name === containerName) {
            return true;
        }
    }
    return false;
}

function checkLinks(serviceContext, container, serviceName, errors) {
    let params = serviceContext.params;
    if (container.links) {
        for (let link of container.links) {
            if (!serviceDefinitionHasContainer(params, link)) {
                errors.push(`${serviceName} - You specified a link '${link}' in the container '${container.name}', but the container '${link}' does not exist`);
            }
        }
    }
}

function getEnvironmentVariablesForContainer(container, ownServiceContext, dependenciesDeployContexts) {
    let environmentVariables = {};

    //Inject env vars defined by service (if any)
    if (container.environment_variables) {
        environmentVariables = _.assign(environmentVariables, container.environment_variables);
    }

    //Inject env vars defined by dependencies
    let dependenciesEnvVars = deployPhaseCommon.getEnvVarsFromDependencyDeployContexts(dependenciesDeployContexts);
    environmentVariables = _.assign(environmentVariables, dependenciesEnvVars);

    //Inject env vars from Handel file
    let handelInjectedEnvVars = deployPhaseCommon.getEnvVarsFromServiceContext(ownServiceContext);
    environmentVariables = _.assign(environmentVariables, handelInjectedEnvVars);

    return environmentVariables;
}


/**
 * This function chooses the image name to use for the ECS container in a task
 * It defaults to a particular naming scheme, but supports giving your own image
 * name as well.
 * 
 * If you want to give an image name in the ECR registry in the account, specify
 * "<account>/myimagename", and <account> will be auto-replaced by the appropriate
 * repository name.
 * 
 * @param {Object} container - The container definition from the Handel file service
 * @param {ServiceContext} ownServiceContext - The ServiceContext of the Handel file
 */
function getImageName(container, ownServiceContext) {
    if (container.image_name) { //Custom user-provided image
        let customImageName = container.image_name;
        if (customImageName.startsWith('<account>')) { //Comes from own account registry
            let imageNameAndTag = customImageName.substring(9);
            return `${accountConfig.account_id}.dkr.ecr.${accountConfig.region}.amazonaws.com${imageNameAndTag}`;
        }
        else { //Must come from somewhere else (Docker Hub, Quay.io, etc.)
            return customImageName;
        }
    }
    else { //Else try to use default image name
        return `${accountConfig.account_id}.dkr.ecr.${accountConfig.region}.amazonaws.com/${ownServiceContext.appName}-${ownServiceContext.serviceName}-${container.name}:${ownServiceContext.environmentName}`;
    }
}

/**
 * Given a container configuration from the containers section in the Handel file,
 * this function returns the links (if any) for that container.
 * 
 * This function returns null if there are no links in the container.
 *  
 * @param {Object} container - The container definition from the Handel file service
 */
function getLinksForContainer(container) {
    let links = null;

    if (container.links) {
        links = [];
        for (let link of container.links) {
            links.push(link);
        }
    }

    return links;
}

/**
 * Given the service and dependency information, this function returns configuration for the containers
 * in the task definition.
 * 
 * Users may specify from 1 to n containers in their configuration, so this function will return
 * a list of 1 to n containers.
 */
exports.getContainersConfig = function (ownServiceContext, dependenciesDeployContexts, clusterName) {
    let serviceParams = ownServiceContext.params;
    let containerConfigs = [];
    let albPriority = 1;
    for (let container of serviceParams.containers) {
        let containerConfig = {};

        containerConfig.name = container.name;
        containerConfig.maxMb = container.max_mb || 128;
        containerConfig.cpuUnits = container.cpu_units || 100;

        //Inject environment variables into the container
        containerConfig.environmentVariables = getEnvironmentVariablesForContainer(container, ownServiceContext, dependenciesDeployContexts);

        //Add port mappings if routing is specified
        if (container.routing) {
            containerConfig.routingInfo = routingSection.getRoutingInformationForContainer(container, albPriority, clusterName);
            albPriority += 1;

            //Add other port mappings to container
            containerConfig.portMappings = [];
            for (let portToMap of container.port_mappings) {
                containerConfig.portMappings.push(portToMap);
            }
        }

        containerConfig.imageName = getImageName(container, ownServiceContext);

        //Add mount points if present
        containerConfig.mountPoints = volumesSection.getMountPointsForContainer(dependenciesDeployContexts);

        //Add links if present
        containerConfig.links = getLinksForContainer(container, ownServiceContext);

        containerConfigs.push(containerConfig);
    }

    return containerConfigs;
}

/**
 * This function is called by the "check" lifecycle phase to check the information in the
 * "containers" section in the Handel service configuration
 */
exports.checkContainers = function (serviceContext, serviceName, errors) {
    let params = serviceContext.params;
    //Require at least one container definition
    if (!params.containers || params.containers.length === 0) {
        errors.push(`${serviceName} - You must specify at least one container in the 'containers' section`);
    }
    else {
        let alreadyHasOneRouting = false;
        for (let container of params.containers) {
            //Require 'name'
            if (!container.name) {
                errors.push(`${serviceName} - The 'name' parameter is required in each container in the 'containers' section`);
            }

            if (container.routing) {
                //Only allow one 'routing' section currently
                if (alreadyHasOneRouting) {
                    errors.push(`${serviceName} - You may not specify a 'routing' section in more than one container. This is due to a current limitation in ECS load balancing`);
                }
                else {
                    alreadyHasOneRouting = true;
                }

                //Require port_mappings if routing is specified
                if (!container.port_mappings) {
                    errors.push(`${serviceName} - The 'port_mappings' parameter is required when you specify the 'routing' element`);
                }
            }

            checkLinks(serviceContext, container, serviceName, errors);
        }
    }
}