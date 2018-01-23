/*
 * Copyright 2017 Brigham Young University
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
import * as winston from 'winston';
import * as autoScalingCalls from '../../aws/auto-scaling-calls';
import * as ecsCalls from '../../aws/ecs-calls';
import { ServiceContext } from '../../datatypes/index';
import { EcsServiceConfig } from './config-types';

export async function getInstancesToCycle(ownServiceContext: ServiceContext<EcsServiceConfig>, defaultInstanceType: string): Promise<AWS.ECS.ContainerInstance[] | null> {
    let lstASGec2 = null;
    const instances = await ecsCalls.listInstances(`${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}`);
    if (!instances) { return lstASGec2; }

    const lstOrig = instances;

    // get current autoscaling config and compare instance type and key name against the handel file
    const ec2InstanceIds = [];
    for (const ec2 of instances) { ec2InstanceIds.push(ec2.ec2InstanceId!); }
    const describeResponse = await autoScalingCalls.describeLaunchConfigurationsByInstanceIds(ec2InstanceIds);
    if (!describeResponse) { return null; }

    for (const cfgRun of describeResponse.LaunchConfigurations) {
        const handel = {
            KeyName: ownServiceContext.params.cluster && ownServiceContext.params.cluster.key_name ? ownServiceContext.params.cluster.key_name : '',
            InstanceType: ownServiceContext.params.cluster && ownServiceContext.params.cluster.instance_type ? ownServiceContext.params.cluster.instance_type : defaultInstanceType
        };

        if (cfgRun.KeyName !== handel.KeyName ||
            cfgRun.InstanceType !== handel.InstanceType) {
            lstASGec2 = lstOrig;
            break;
        }
    }

    return lstASGec2;
}

export function cycleInstances(instancesToCycle: AWS.ECS.ContainerInstance[] | null) {
    if (instancesToCycle) {
        winston.info('Config changed that requires new EC2 instances');
        winston.info('Rolling auto-scaling group to launch new EC2 instances.');
        return autoScalingCalls.cycleInstances(instancesToCycle);
    }
}
