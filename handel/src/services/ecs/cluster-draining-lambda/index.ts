import * as AWS from 'aws-sdk';

const MAX_RESULTS = 100;

const getContainerInstanceIds = async (ecs: AWS.ECS, clusterArn: string, containerInstanceArns: string[]): Promise<string[]> => {
  if(containerInstanceArns.length === 0) {
    return [];
  }

  const describeParams: AWS.ECS.DescribeContainerInstancesRequest = {
    containerInstances: containerInstanceArns,
    cluster: clusterArn
  };
  const describeResponse = await ecs.describeContainerInstances(describeParams).promise();
  return (describeResponse.containerInstances || []).map(containerInstance => containerInstance.ec2InstanceId!);
};

const getClusterContainerInstances = async (ecs: AWS.ECS, clusterArn: string, nextToken: string | null): Promise<string[]> => {
  const listContainerParams: AWS.ECS.ListContainerInstancesRequest = {
    cluster: clusterArn,
    maxResults: MAX_RESULTS
  };
  if(nextToken) {
    listContainerParams.nextToken = nextToken;
  }
  const listRes = await ecs.listContainerInstances(listContainerParams).promise();

  let containerInstanceArns: string[] = [];
  if(listRes.containerInstanceArns) {
    containerInstanceArns = containerInstanceArns.concat(listRes.containerInstanceArns);
  }

  if(listRes.nextToken) {
    const restContainerInstanceArns = await getClusterContainerInstances(ecs, clusterArn, listRes.nextToken);
    containerInstanceArns = containerInstanceArns.concat(restContainerInstanceArns);
  }

  return containerInstanceArns;
};

const findClusterForInstance = async (ecs: AWS.ECS, ec2InstanceId: string, nextToken: string | null): Promise<string | null> => {
  const listParams: AWS.ECS.ListClustersRequest = {
    maxResults: MAX_RESULTS
  };
  if(nextToken) {
    listParams.nextToken = nextToken;
  }
  const listRes = await ecs.listClusters(listParams).promise();

  if(!listRes.clusterArns || listRes.clusterArns.length === 0) { // No more results
    return null; // We couldn't find a cluster for the requested instance
  }

  for(const clusterArn of listRes.clusterArns) {
    const clusterInstanceArns = await getClusterContainerInstances(ecs, clusterArn, null);
    const clusterInstanceIds = await getContainerInstanceIds(ecs, clusterArn, clusterInstanceArns);
    if(clusterInstanceIds.includes(ec2InstanceId)) {
      return clusterArn;
    }
  }

  // We didn't return yet, so still iterate
  if(listRes.nextToken) {
    return findClusterForInstance(ecs, ec2InstanceId, listRes.nextToken);
  }
  else {
    return null; // Nothing left to look for
  }
};

const setInstanceToDraining = async (ecs: AWS.ECS, ec2InstanceId: string, clusterArn: string): Promise<void> => {
  // tslint:disable-next-line:no-console
  console.log(`Draining instance '${ec2InstanceId}' in cluster '${clusterArn}'`);
  const updateStateParams = {
    containerInstances: [ec2InstanceId],
    status: 'DRAINING',
    cluster: clusterArn
  };
  const updateResponse = await ecs.updateContainerInstancesState(updateStateParams).promise();
  // tslint:disable-next-line:no-console
  console.log(`Response from instance draining '${JSON.stringify(updateResponse)}'`);
};

/**
 * This function searches the ecs clusters to find out which one contains the ec2 container to drain then updates its status to DRAINING if found
 */
const drainInstance = async (ecs: AWS.ECS, ec2InstanceId: string): Promise<void> => {
  // find for the cluster name this instance is part of
  const clusterArn = await findClusterForInstance(ecs, ec2InstanceId, null);

  if(!clusterArn) {
    // tslint:disable-next-line:no-console
    console.log(`No cluster found for instance '${ec2InstanceId}'`);
    return;
  }
  return setInstanceToDraining(ecs, ec2InstanceId, clusterArn);
};

/**
 * This function gets the instanceId from the terminate event and requests it's state change to DRAINING
 */
export function handler(event: any, context: any) {
  // these are now defined inside the handler so the aws-sdk-mock will work correctly
  if (!AWS.config.region) { AWS.config.region = 'us-west-2'; }
  const ecs = new AWS.ECS({ apiVersion: '2014-11-13' });
  return drainInstance(ecs, event.detail.EC2InstanceId);
}
