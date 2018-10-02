/*
 * Copyright 2018 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { DeployContext, EnvironmentVariables, ServiceContext } from 'handel-extension-api';
import { deployPhase } from 'handel-extension-support';
import * as _ from 'lodash';
import { FargateServiceConfig } from '../services/ecs-fargate/config-types';
import { EcsServiceConfig } from '../services/ecs/config-types';
import * as routingSection from './ecs-routing';
import { ContainerConfig, HandlebarsEcsTemplateContainer } from './ecs-shared-config-types';
import * as volumesSection from './ecs-volumes';

function serviceDefinitionHasContainer(serviceParams: EcsServiceConfig, containerName: string) {
    for (const container of serviceParams.containers) {
        if (container.name === containerName) {
            return true;
        }
    }
    return false;
}

function checkLinks(serviceContext: ServiceContext<EcsServiceConfig>, container: ContainerConfig, errors: string[]) {
    const params = serviceContext.params;
    if (container.links) {
        for (const link of container.links) {
            if (!serviceDefinitionHasContainer(params, link)) {
                errors.push(`You specified a link '${link}' in the container '${container.name}', but the container '${link}' does not exist`);
            }
        }
    }
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
function getImageName(container: ContainerConfig, ownServiceContext: ServiceContext<EcsServiceConfig>): string {
    const accountConfig = ownServiceContext.accountConfig;
    if (container.image_name) { // Custom user-provided image
        const customImageName = container.image_name;
        if (customImageName.startsWith('<account>')) { // Comes from own account registry
            const imageNameAndTag = customImageName.substring(9);
            return `${accountConfig.account_id}.dkr.ecr.${accountConfig.region}.amazonaws.com${imageNameAndTag}`;
        }
        else { // Must come from somewhere else (Docker Hub, Quay.io, etc.)
            return customImageName;
        }
    }
    else { // Else try to use default image name
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
function getLinksForContainer(container: ContainerConfig): string[] | undefined {
    if (container.links) {
        const links: string[] = [];
        for (const link of container.links) {
            links.push(link);
        }
        return links;
    }
}

/**
 * Given the service and dependency information, this function returns configuration for the containers
 * in the task definition.
 *
 * Users may specify from 1 to n containers in their configuration, so this function will return
 * a list of 1 to n containers.
 */
export function getContainersConfig(ownServiceContext: ServiceContext<EcsServiceConfig>, dependenciesDeployContexts: DeployContext[], clusterName: string): HandlebarsEcsTemplateContainer[] {
    const serviceParams = ownServiceContext.params;
    const containerConfigs: HandlebarsEcsTemplateContainer[] = [];
    let albPriority = 1;
    for (const container of serviceParams.containers) {
        const containerConfig: HandlebarsEcsTemplateContainer = {
            name: container.name,
            maxMb: container.max_mb || 128,
            cpuUnits: container.cpu_units || 100,
            environmentVariables: deployPhase.getEnvVarsForDeployedService(ownServiceContext, dependenciesDeployContexts, container.environment_variables),
            portMappings: [], // This is filled up below if any mappings present
            imageName: getImageName(container, ownServiceContext),
            mountPoints: volumesSection.getMountPointsForContainer(dependenciesDeployContexts), // Add mount points if present
            links: getLinksForContainer(container), // Add links if present

        };

        // Add port mappings if routing is specified
        if (container.routing) {
            containerConfig.routingInfo = routingSection.getRoutingInformationForContainer(container, albPriority, clusterName);
            albPriority += 1;

            // Add other port mappings to container
            if (container.port_mappings) {
                for (const portToMap of container.port_mappings) {
                    containerConfig.portMappings.push(portToMap);
                }
            }
        }

        containerConfigs.push(containerConfig);
    }

    return containerConfigs;
}

/**
 * This function is called by the "check" lifecycle phase to check the information in the
 * "containers" section in the Handel service configuration
 */
export function checkContainers(serviceContext: ServiceContext<EcsServiceConfig | FargateServiceConfig>, errors: string[]) {
    const params = serviceContext.params;
    // Require at least one container definition
    if (!params.containers || params.containers.length === 0) {
        errors.push(`You must specify at least one container in the 'containers' section`);
    }
    else {
        let alreadyHasOneRouting = false;
        for (const container of params.containers) {
            if (container.routing) {
                // Only allow one 'routing' section currently
                if (alreadyHasOneRouting) {
                    errors.push(`You may not specify a 'routing' section in more than one container. This is due to a current limitation in ECS load balancing`);
                }
                else {
                    alreadyHasOneRouting = true;
                }

                // Require port_mappings if routing is specified
                if (!container.port_mappings) {
                    errors.push(`The 'port_mappings' parameter is required when you specify the 'routing' element`);
                }
            }

            checkLinks(serviceContext, container, errors);
        }
    }
}
