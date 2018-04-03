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
import { DeployContext } from 'handel-extension-api';
import { STDLIB_PREFIX } from '../services/stdlib';
import * as deployPhaseCommon from './deploy-phase-common';
import { HandlebarsEcsTemplateMountPoint, HandlebarsEcsTemplateVolume } from './ecs-shared-config-types';

function getDependenciesDeployContextMountPoints(dependenciesDeployContexts: DeployContext[]) {
    const mountPoints = [];
    for (const deployContext of dependenciesDeployContexts) {
        if (deployContext.serviceType.matches(STDLIB_PREFIX, 'efs')) { // Only EFS is supported as an external service mount point for now
            const envVarKey = deployPhaseCommon.getInjectedEnvVarName(deployContext, 'MOUNT_DIR');

            mountPoints.push({
                mountDir: deployContext.environmentVariables[envVarKey],
                name: envVarKey
            });
        }
    }
    return mountPoints;
}

export function getVolumes(dependenciesDeployContexts: DeployContext[]): HandlebarsEcsTemplateVolume[] | undefined {
    const dependenciesMountPoints = getDependenciesDeployContextMountPoints(dependenciesDeployContexts);
    if (Object.keys(dependenciesMountPoints).length > 0) {
        const volumes: HandlebarsEcsTemplateVolume[] = [];

        for (const taskDefMountPoint of dependenciesMountPoints) {
            volumes.push({
                sourcePath: taskDefMountPoint.mountDir,
                name: taskDefMountPoint.name
            });
        }

        return volumes;
    }
}

export function getMountPointsForContainer(dependenciesDeployContexts: DeployContext[]): HandlebarsEcsTemplateMountPoint[] | undefined {
    let mountPoints;
    const dependenciesMountPoints = getDependenciesDeployContextMountPoints(dependenciesDeployContexts);
    if (Object.keys(dependenciesMountPoints).length > 0) {
        mountPoints = [];

        for (const taskDefMountPoint of dependenciesMountPoints) {
            mountPoints.push({
                containerPath: taskDefMountPoint.mountDir,
                sourceVolume: taskDefMountPoint.name
            });
        }
    }
    return mountPoints;
}
