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
const ecsCalls = require('../../aws/ecs-calls');
const autoScalingCalls = require('../../aws/auto-scaling-calls');
const winston = require('winston');

exports.getInstancesToCycle = function(ownServiceContext, defaultInstanceType) {
    let lstASGec2 = null;
    return ecsCalls.listInstances(`${ownServiceContext.appName}-${ownServiceContext.environmentName}-${ownServiceContext.serviceName}`)
        .then(instances => {
            if (!instances) { return lstASGec2 }

            let lstOrig = instances;

            // get current autoscaling config and compare instance type and key name against the handel file
            let lst = [];
            for (let ec2 of instances) { lst.push(ec2.id) }
            return autoScalingCalls.describeLaunchConfigurationsByInstanceIds(lst)
                .then(dat => {
                    if (!dat) { return null; }

                    for (let cfgRun of dat.LaunchConfigurations) {
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
                });
        });
}

exports.cycleInstances = function(instancesToCycle) {
    if (instancesToCycle) {
        winston.info("Config changed that requires new EC2 instances");
        winston.info("Rolling auto-scaling group to launch new EC2 instances.");
        return autoScalingCalls.cycleInstances(instancesToCycle)
    }
}