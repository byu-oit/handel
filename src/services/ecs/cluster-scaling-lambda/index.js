
const AWS = require('aws-sdk');
AWS.config.region = 'us-west-2';

function getClusters(ecs) {
    return ecs.listClusters({}).promise()
        .then(listResponse => {
            let clusterArns = listResponse.clusterArns;
            return clusterArns;
        })
        .then(clusterArns => {
            let clusterPromises = [];

            for (let clusterArn of clusterArns) {
                let describeParams = {
                    clusters: [clusterArn]
                }
                let clusterPromise = ecs.describeClusters(describeParams).promise()
                    .then(clusterResponse => {
                        return clusterResponse.clusters[0];
                    });
                clusterPromises.push(clusterPromise);
            }

            return Promise.all(clusterPromises);
        });
}

function getContainerInstances(clusterName, ecs) {
    let listParams = {
        cluster: clusterName
    }
    return ecs.listContainerInstances(listParams).promise()
        .then(listResponse => {
            let containerInstanceArns = listResponse.containerInstanceArns;
            return containerInstanceArns;
        })
        .then(containerInstanceArns => {
            let containerInstancePromises = [];

            for (let containerInstanceArn of containerInstanceArns) {
                let describeParams = {
                    cluster: clusterName,
                    containerInstances: [containerInstanceArn]
                }
                let containerInstancePromise = ecs.describeContainerInstances(describeParams).promise()
                    .then(describeResponse => {
                        return describeResponse.containerInstances[0];
                    });
                containerInstancePromises.push(containerInstancePromise);
            }

            return Promise.all(containerInstancePromises);
        });
}

function getCpuRemainingFromContainerInstance(containerInstance) {
    for (let remainingResource of containerInstance.remainingResources) {
        if (remainingResource.name === 'CPU') {
            return remainingResource.integerValue;
        }
    }
}

function getMemoryRemainingFromContainerInstance(containerInstance) {
    for (let remainingResource of containerInstance.remainingResources) {
        if (remainingResource.name === 'MEMORY') {
            return remainingResource.integerValue;
        }
    }
}

function getCpuRegisteredFromContainerInstance(containerInstance) {
    for (let registeredResource of containerInstance.registeredResources) {
        if (registeredResource.name === 'CPU') {
            return registeredResource.integerValue;
        }
    }
}

function getMemoryRegisteredFromContainerInstance(containerInstance) {
    for (let registeredResource of containerInstance.registeredResources) {
        if (registeredResource.name === 'MEMORY') {
            return registeredResource.integerValue;
        }
    }
}

function getTaskDefinitionForTask(ecs, clusterName, taskArn) {
    let describeTaskParams = {
        cluster: clusterName,
        tasks: [taskArn]
    }
    return ecs.describeTasks(describeTaskParams).promise()
        .then(describeTaskResponse => {
            return describeTaskResponse.tasks[0];
        })
        .then(task => {
            let describeTaskDefParams = {
                taskDefinition: task.taskDefinitionArn
            };
            return ecs.describeTaskDefinition(describeTaskDefParams).promise()
                .then(describeTaskDefResponse => {
                    return describeTaskDefResponse.taskDefinition;
                });
        });
}

function getMaxTaskReservedMetrics(ecs, clusterName) {
    let listParams = {
        cluster: clusterName
    }
    return ecs.listTasks(listParams).promise()
        .then(listResponse => {
            return listResponse.taskArns;
        })
        .then(taskArns => {
            let taskDefPromises = [];

            for (let taskArn of taskArns) {
                taskDefPromises.push(getTaskDefinitionForTask(ecs, clusterName, taskArn));
            }

            return Promise.all(taskDefPromises);
        })
        .then(taskDefinitions => {
            let maxMetrics = {
                cpu: 0,
                memory: 0
            };

            for (let taskDefinition of taskDefinitions) {
                for (let containerDefinition of taskDefinition.containerDefinitions) {
                    let reservedCpu = containerDefinition.cpu;
                    if (reservedCpu > maxMetrics.cpu) {
                        maxMetrics.cpu = reservedCpu;
                    }
                    let reservedMemory = containerDefinition.memory;
                    if (reservedMemory > maxMetrics.memory) {
                        maxMetrics.memory = reservedMemory;
                    }
                }
            }

            return maxMetrics;
        });
}

function getSchedulableMetricsForCluster(ecs, clusterName) {
    return getContainerInstances(clusterName, ecs)
        .then(containerInstances => {
            return getMaxTaskReservedMetrics(ecs, clusterName)
                .then(maxReservedMetrics => {
                    //Calculate schedulable containers for cluster
                    let schedulableContainers = 0;
                    for (let instance of containerInstances) {
                        if(instance.status!='ACTIVE')continue;  // only consider ACTIVE instances
                        let cpuRemaining = getCpuRemainingFromContainerInstance(instance);
                        let memoryRemaining = getMemoryRemainingFromContainerInstance(instance);

                        let containersByCpu = cpuRemaining / maxReservedMetrics.cpu;
                        let containersByMemory = memoryRemaining / maxReservedMetrics.memory;
                        schedulableContainers += Math.floor(Math.min(containersByCpu, containersByMemory));
                    }

                    //Calculate max number of largest schedulable containers that will fit on the largets instance in the cluster
                    let maxRegisteredCpu = 0;
                    let maxRegisteredMemory = 0;
                    for (let instance of containerInstances) {
                        if(instance.status!='ACTIVE')continue;  // only consider ACTIVE instances
                        let registeredCpu = getCpuRegisteredFromContainerInstance(instance);
                        let registeredMemory = getMemoryRegisteredFromContainerInstance(instance);

                        if (registeredCpu > maxRegisteredCpu) {
                            maxRegisteredCpu = registeredCpu;
                        }
                        if (registeredMemory > maxRegisteredMemory) {
                            maxRegisteredMemory = registeredMemory;
                        }
                    }

                    let containersScaledownThreshold = Math.floor(Math.min((maxRegisteredCpu / maxReservedMetrics.cpu), (maxRegisteredMemory / maxReservedMetrics.memory)));

                    return {
                        schedulableContainers,
                        containersScaledownThreshold
                    }
                });
        });
}

function putScalingMetric(cloudwatch, clusterName, metricName, needsScaling) {
    let putParams = {
        MetricData: [
            {
                MetricName: metricName,
                Dimensions: [
                    {
                        Name: 'ClusterName',
                        Value: clusterName,
                    }
                ],
                Timestamp: new Date(),
                Unit: 'Count',
                Value: needsScaling
            }
        ],
        Namespace: 'Handel/ECS'
    }
    return cloudwatch.putMetricData(putParams).promise();
}

function putMultipleMetrics(cloudwatch, clusterName, metrics) {
    let putPromises = [];

    for (let metricName in metrics) {
        let metricValue = metrics[metricName];
        putPromises.push(putScalingMetric(cloudwatch, clusterName, metricName, metricValue));
    }

    return Promise.all(putPromises);
}



function updateScalingMetricsForCluster(cluster, ecs, cloudwatch) {
    let clusterName = cluster.clusterName;

    return getSchedulableMetricsForCluster(ecs, clusterName)
        .then(schedulableMetrics => {
            //TODO - Get scale down threshold
            let schedulableContainers = schedulableMetrics.schedulableContainers;
            console.log(`Cluster '${clusterName} has room for  ${schedulableContainers} of the largest containers on the cluster`);
            let containerScaledownThreshold = schedulableMetrics.containersScaledownThreshold;
            console.log(`Cluster '${clusterName} needs to have room for at least ${containerScaledownThreshold} before it will start scaling down`);

            if (schedulableContainers < 1) { //Need to scale up cluster
                console.log(`Cluster '${clusterName}' needs to scale up`);
                return putMultipleMetrics(cloudwatch, clusterName, {
                    ClusterNeedsScalingUp: 1,
                    ClusterNeedsScalingDown: 0
                });
            }
            else if (schedulableContainers > containerScaledownThreshold) {
                console.log(`Cluster '${clusterName}' needs to scale down`);
                return putMultipleMetrics(cloudwatch, clusterName, {
                    ClusterNeedsScalingUp: 0,
                    ClusterNeedsScalingDown: 1
                });
            }
            else { //No scaling (up or down) required at this time
                console.log(`Cluster '${clusterName}' does not need scaling at this time`);
                return putMultipleMetrics(cloudwatch, clusterName, {
                    ClusterNeedsScalingUp: 0,
                    ClusterNeedsScalingDown: 0
                });
            }
        });
}


/**
 * Iterates through the clusters in the account and updates scaling CloudWatch metrics for the clusters
 *
 * This scaling decision algorithm was based heavily on Philipp Garbe's excellent blog post at 
 * http://garbe.io/blog/2017/04/12/a-better-solution-to-ecs-autoscaling/.
 */
exports.handler = function (event, context) {
    const cloudwatch = new AWS.CloudWatch({ apiVersion: '2010-08-01' });
    const ecs = new AWS.ECS({ apiVersion: '2014-11-13' });

    return getClusters(ecs)
        .then(clusters => {
            let updateMetricsPromises = [];
            for (let cluster of clusters) {
                console.log(`Updating metrics for cluster '${cluster.clusterName}'`);
                updateMetricsPromises.push(updateScalingMetricsForCluster(cluster, ecs, cloudwatch));
            }
            return Promise.all(updateMetricsPromises);
        });
}

