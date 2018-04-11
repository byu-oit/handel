
import * as AWS from 'aws-sdk';
AWS.config.region = 'us-west-2';

interface ClusterScalingMetrics {
    [key: string]: number;
}

async function getClusters(ecs: AWS.ECS): Promise<AWS.ECS.Cluster[]> {
    const listResponse = await ecs.listClusters({}).promise();
    const clusterArns = listResponse.clusterArns || [];
    const clusterPromises = [];

    for (const clusterArn of clusterArns) {
        const describeParams = {
            clusters: [clusterArn]
        };
        const clusterPromise = ecs.describeClusters(describeParams).promise()
            .then(clusterResponse => {
                if (!clusterResponse.clusters || !clusterResponse.clusters[0]) { // This should definitely return because we just got the name from listClusters
                    throw new Error(`Couldn't describe a cluster we just got back from listClusters!`);
                }
                return clusterResponse.clusters[0];
            });
        clusterPromises.push(clusterPromise);
    }

    return Promise.all(clusterPromises);
}

async function getContainerInstances(clusterName: string, ecs: AWS.ECS): Promise<AWS.ECS.ContainerInstance[]> {
    const listParams = {
        cluster: clusterName
    };
    const listResponse = await ecs.listContainerInstances(listParams).promise();
    const containerInstanceArns = listResponse.containerInstanceArns || [];
    const containerInstancePromises = [];

    for (const containerInstanceArn of containerInstanceArns) {
        const describeParams = {
            cluster: clusterName,
            containerInstances: [containerInstanceArn]
        };
        const containerInstancePromise = ecs.describeContainerInstances(describeParams).promise()
            .then(describeResponse => {
                if (!describeResponse.containerInstances || !describeResponse.containerInstances[0]) { // This should definitely return because we just got it back from listContainerInstances
                    throw new Error(`Couldn't describe a container instance we just got back from listContainerInstances!`);
                }
                return describeResponse.containerInstances[0];
            });
        containerInstancePromises.push(containerInstancePromise);
    }

    return Promise.all(containerInstancePromises);
}

function getCpuRemainingFromContainerInstance(containerInstance: AWS.ECS.ContainerInstance): number | undefined {
    const remainingResources = containerInstance.remainingResources || [];
    for (const remainingResource of remainingResources) {
        if (remainingResource.name === 'CPU') {
            return remainingResource.integerValue;
        }
    }
}

function getMemoryRemainingFromContainerInstance(containerInstance: AWS.ECS.ContainerInstance): number | undefined {
    const remainingResources = containerInstance.remainingResources || [];
    for (const remainingResource of remainingResources) {
        if (remainingResource.name === 'MEMORY') {
            return remainingResource.integerValue;
        }
    }
}

function getCpuRegisteredFromContainerInstance(containerInstance: AWS.ECS.ContainerInstance): number | undefined {
    const registeredResources = containerInstance.registeredResources || [];
    for (const registeredResource of registeredResources) {
        if (registeredResource.name === 'CPU') {
            return registeredResource.integerValue;
        }
    }
}

function getMemoryRegisteredFromContainerInstance(containerInstance: AWS.ECS.ContainerInstance): number | undefined {
    const registeredResources = containerInstance.registeredResources || [];
    for (const registeredResource of registeredResources) {
        if (registeredResource.name === 'MEMORY') {
            return registeredResource.integerValue;
        }
    }
}

async function getTaskDefinitionForTask(ecs: AWS.ECS, clusterName: string, taskArn: string): Promise<AWS.ECS.TaskDefinition | null> {
    const describeTaskParams = {
        cluster: clusterName,
        tasks: [taskArn]
    };
    const describeTaskResponse = await ecs.describeTasks(describeTaskParams).promise();
    if (!describeTaskResponse.tasks || !describeTaskResponse.tasks[0]) { return null; }
    const task = describeTaskResponse.tasks[0];
    const describeTaskDefParams = {
        taskDefinition: task.taskDefinitionArn!
    };
    const describeTaskDefResponse = await ecs.describeTaskDefinition(describeTaskDefParams).promise();
    if (!describeTaskDefResponse.taskDefinition) { return null; }
    return describeTaskDefResponse.taskDefinition;
}

async function getMaxTaskReservedMetrics(ecs: AWS.ECS, clusterName: string) {
    const listParams = {
        cluster: clusterName
    };
    const listResponse = await ecs.listTasks(listParams).promise();
    const taskArns = listResponse.taskArns || [];
    const taskDefPromises = [];

    for (const taskArn of taskArns) {
        taskDefPromises.push(getTaskDefinitionForTask(ecs, clusterName, taskArn));
    }

    const taskDefinitions = await Promise.all(taskDefPromises);
    const maxMetrics = {
        cpu: 0,
        memory: 0
    };

    for (const taskDefinition of taskDefinitions) {
        if (taskDefinition) {
            const containerDefinitions = taskDefinition.containerDefinitions || [];
            for (const containerDefinition of containerDefinitions) {
                const reservedCpu = containerDefinition.cpu!;
                if (reservedCpu > maxMetrics.cpu) {
                    maxMetrics.cpu = reservedCpu;
                }
                const reservedMemory = containerDefinition.memory!;
                if (reservedMemory > maxMetrics.memory) {
                    maxMetrics.memory = reservedMemory;
                }
            }
        }
    }

    return maxMetrics;
}

async function getSchedulableMetricsForCluster(ecs: AWS.ECS, clusterName: string) {
    const containerInstances = await getContainerInstances(clusterName, ecs);
    const maxReservedMetrics = await getMaxTaskReservedMetrics(ecs, clusterName);
    // Calculate schedulable containers for cluster
    let schedulableContainers = 0;
    for (const instance of containerInstances) {
        if (instance.status !== 'ACTIVE') { continue; }  // only consider ACTIVE instances
        const cpuRemaining = getCpuRemainingFromContainerInstance(instance);
        const memoryRemaining = getMemoryRemainingFromContainerInstance(instance);
        if(!cpuRemaining || !memoryRemaining) {
            throw new Error(`Could not obtain CPU or memory remaining for container instance ${instance.ec2InstanceId}`);
        }

        const containersByCpu = cpuRemaining / maxReservedMetrics.cpu;
        const containersByMemory = memoryRemaining / maxReservedMetrics.memory;
        schedulableContainers += Math.floor(Math.min(containersByCpu, containersByMemory));
    }

    // Calculate max number of largest schedulable containers that will fit on the largets instance in the cluster
    let maxRegisteredCpu = 0;
    let maxRegisteredMemory = 0;
    for (const instance of containerInstances) {
        if (instance.status !== 'ACTIVE') { continue; }  // only consider ACTIVE instances
        const registeredCpu = getCpuRegisteredFromContainerInstance(instance);
        const registeredMemory = getMemoryRegisteredFromContainerInstance(instance);
        if(!registeredCpu || !registeredMemory) {
            throw new Error(`Could not obtain CPU or memory registered for container instance ${instance.ec2InstanceId}`);
        }

        if (registeredCpu > maxRegisteredCpu) {
            maxRegisteredCpu = registeredCpu;
        }
        if (registeredMemory > maxRegisteredMemory) {
            maxRegisteredMemory = registeredMemory;
        }
    }

    const containersScaledownThreshold = Math.floor(Math.min((maxRegisteredCpu / maxReservedMetrics.cpu), (maxRegisteredMemory / maxReservedMetrics.memory)));

    return {
        schedulableContainers,
        containersScaledownThreshold
    };
}

async function putScalingMetric(cloudwatch: AWS.CloudWatch, clusterName: string, metricName: string, needsScaling: number): Promise<{}> {
    const putParams: AWS.CloudWatch.Types.PutMetricDataInput = {
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
    };
    return cloudwatch.putMetricData(putParams).promise();
}

async function putMultipleMetrics(cloudwatch: AWS.CloudWatch, clusterName: string, metrics: ClusterScalingMetrics) {
    const putPromises = [];

    for (const metricName in metrics) {
        if (metrics.hasOwnProperty(metricName)) {
            const metricValue = metrics[metricName];
            putPromises.push(putScalingMetric(cloudwatch, clusterName, metricName, metricValue));
        }
    }

    return Promise.all(putPromises);
}

async function updateScalingMetricsForCluster(cluster: AWS.ECS.Cluster, ecs: AWS.ECS, cloudwatch: AWS.CloudWatch) {
    const clusterName = cluster.clusterName!; // The cluster name should always be present

    const schedulableMetrics = await getSchedulableMetricsForCluster(ecs, clusterName);
    // TODO - Get scale down threshold
    const schedulableContainers = schedulableMetrics.schedulableContainers;
    // tslint:disable-next-line:no-console
    console.log(`Cluster '${clusterName} has room for  ${schedulableContainers} of the largest containers on the cluster`);
    const containerScaledownThreshold = schedulableMetrics.containersScaledownThreshold;
    // tslint:disable-next-line:no-console
    console.log(`Cluster '${clusterName} needs to have room for at least ${containerScaledownThreshold} before it will start scaling down`);

    if (schedulableContainers < 1) { // Need to scale up cluster
        // tslint:disable-next-line:no-console
        console.log(`Cluster '${clusterName}' needs to scale up`);
        return putMultipleMetrics(cloudwatch, clusterName, {
            ClusterNeedsScalingUp: 1,
            ClusterNeedsScalingDown: 0
        });
    }
    else if (schedulableContainers > containerScaledownThreshold) {
        // tslint:disable-next-line:no-console
        console.log(`Cluster '${clusterName}' needs to scale down`);
        return putMultipleMetrics(cloudwatch, clusterName, {
            ClusterNeedsScalingUp: 0,
            ClusterNeedsScalingDown: 1
        });
    }
    else { // No scaling (up or down) required at this time
        // tslint:disable-next-line:no-console
        console.log(`Cluster '${clusterName}' does not need scaling at this time`);
        return putMultipleMetrics(cloudwatch, clusterName, {
            ClusterNeedsScalingUp: 0,
            ClusterNeedsScalingDown: 0
        });
    }
}

/**
 * Iterates through the clusters in the account and updates scaling CloudWatch metrics for the clusters
 *
 * This scaling decision algorithm was based heavily on Philipp Garbe's excellent blog post at
 * http://garbe.io/blog/2017/04/12/a-better-solution-to-ecs-autoscaling/.
 */
export async function handler(event: any, context: any) { // TODO - Find out what to put for these types here
    const cloudwatch = new AWS.CloudWatch({ apiVersion: '2010-08-01' });
    const ecs = new AWS.ECS({ apiVersion: '2014-11-13' });

    const clusters = await getClusters(ecs);
    const updateMetricsPromises = [];
    for (const cluster of clusters) {
        // tslint:disable-next-line:no-console
        console.log(`Updating metrics for cluster '${cluster.clusterName}'`);
        updateMetricsPromises.push(updateScalingMetricsForCluster(cluster, ecs, cloudwatch));
    }
    return Promise.all(updateMetricsPromises);
}
