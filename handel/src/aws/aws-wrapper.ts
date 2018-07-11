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

/**
 * This module exists because I haven't yet been able to figure out a way
 * to mock the AWS SDK when using Sinon and TypeScript. The 'aws-sdk-mock'
 * tool doesn't work in TypeScript, and I have yet to find out how to use
 * Sinon to mock the SDK when using promises.
 */

import * as AWS from 'aws-sdk';

const awsWrapper = {
    iam: {
        createRole: (params: AWS.IAM.CreateRoleRequest): Promise<AWS.IAM.CreateRoleResponse> => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.createRole(params).promise();
        },
        getRole: (params: AWS.IAM.GetRoleRequest): Promise<AWS.IAM.GetRoleResponse> => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.getRole(params).promise();
        },
        attachRolePolicy: (params: AWS.IAM.AttachRolePolicyRequest) => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.attachRolePolicy(params).promise();
        },
        getPolicy: (params: AWS.IAM.GetPolicyRequest): Promise<AWS.IAM.GetPolicyResponse> => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.getPolicy(params).promise();
        },
        createPolicy: (params: AWS.IAM.CreatePolicyRequest): Promise<AWS.IAM.CreatePolicyResponse> => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.createPolicy(params).promise();
        },
        createPolicyVersion: (params: AWS.IAM.CreatePolicyVersionRequest) => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.createPolicyVersion(params).promise();
        },
        listPolicyVersions: (params: AWS.IAM.ListPolicyVersionsRequest) => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.listPolicyVersions(params).promise();
        },
        deletePolicyVersion: (params: AWS.IAM.DeletePolicyVersionRequest) => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.deletePolicyVersion(params).promise();
        },
        listAttachedRolePolicies: (params: AWS.IAM.ListAttachedRolePoliciesRequest) => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.listAttachedRolePolicies(params).promise();
        },
        listRoles: (params: AWS.IAM.ListRolesRequest): Promise<AWS.IAM.ListRolesResponse> => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.listRoles(params).promise();
        },
        deleteRole: (params: AWS.IAM.DeleteRoleRequest) => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.deleteRole(params).promise();
        },
        deletePolicy: (params: AWS.IAM.DeletePolicyRequest) => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.deletePolicy(params).promise();
        },
        detachRolePolicy: (params: AWS.IAM.DetachRolePolicyRequest) => {
            const iam = new AWS.IAM({ apiVersion: '2010-05-08' });
            return iam.detachRolePolicy(params).promise();
        }
    },
    s3: {
        putBucketNotificationConfiguration: (params: AWS.S3.PutBucketNotificationConfigurationRequest): Promise<{}> => {
            const s3 = new AWS.S3({apiVersion: '2006-03-01'});
            return s3.putBucketNotificationConfiguration(params).promise();
        }
    },
    ses: {
        getIdentityVerificationAttributes: (params: AWS.SES.GetIdentityVerificationAttributesRequest) => {
            const ses = new AWS.SES({ apiVersion: '2010-12-01' });
            return ses.getIdentityVerificationAttributes(params).promise();
        },
        verifyEmailAddress: (params: AWS.SES.VerifyEmailAddressRequest) => {
            const ses = new AWS.SES({ apiVersion: '2010-12-01' });
            return ses.verifyEmailAddress(params).promise();
        }
    },
    ec2: {
        describeSecurityGroups: (params: AWS.EC2.DescribeSecurityGroupsRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.describeSecurityGroups(params).promise();
        },
        revokeSecurityGroupIngress: (params: AWS.EC2.RevokeSecurityGroupIngressRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.revokeSecurityGroupIngress(params).promise();
        },
        authorizeSecurityGroupIngress: (params: AWS.EC2.AuthorizeSecurityGroupIngressRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.authorizeSecurityGroupIngress(params).promise();
        },
        describeImages: (params: AWS.EC2.DescribeImagesRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.describeImages(params).promise();
        },
        describeRegions: (params: AWS.EC2.DescribeRegionsRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.describeRegions(params).promise();
        },
        describeSubnets: (params: AWS.EC2.DescribeSubnetsRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.describeSubnets(params).promise();
        },
        describeVpcs: (params: AWS.EC2.DescribeVpcsRequest) => {
            const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
            return ec2.describeVpcs(params).promise();
        }
    },
    sts: {
        getCallerIdentity: (params: AWS.STS.GetCallerIdentityRequest) => {
            const sts = new AWS.STS({apiVersion: '2011-06-15'});
            return sts.getCallerIdentity(params).promise();
        }
    },
    autoScaling: {
        terminateInstanceInAutoScalingGroup: (params: any) => {
            const autoScaling = new AWS.AutoScaling({ apiVersion: '2011-01-01' });
            return autoScaling.terminateInstanceInAutoScalingGroup(params).promise();
        },
        describeAutoScalingInstances: (params: any) => {
            const autoScaling = new AWS.AutoScaling({ apiVersion: '2011-01-01' });
            return autoScaling.describeAutoScalingInstances(params).promise();
        },
        describeAutoScalingGroups: (params: AWS.AutoScaling.Types.AutoScalingGroupNamesType): Promise<AWS.AutoScaling.AutoScalingGroupsType> => {
            const autoScaling = new AWS.AutoScaling({ apiVersion: '2011-01-01' });
            return autoScaling.describeAutoScalingGroups(params).promise();
        },
        describeLaunchConfigurations: (params: any) => {
            const autoScaling = new AWS.AutoScaling({ apiVersion: '2011-01-01' });
            return autoScaling.describeLaunchConfigurations(params).promise();
        },
        updateAutoScalingGroup: (params: AWS.AutoScaling.UpdateAutoScalingGroupType): Promise<{}> => {
            const autoScaling = new AWS.AutoScaling({ apiVersion: '2011-01-01' });
            return autoScaling.updateAutoScalingGroup(params).promise();
        }
    },
    ecs: {
        describeClusters: (params: AWS.ECS.DescribeClustersRequest) => {
            const ecs = new AWS.ECS({ apiVersion: '2014-11-13' });
            return ecs.describeClusters(params).promise();
        },
        createCluster: (params: AWS.ECS.CreateClusterRequest) => {
            const ecs = new AWS.ECS({ apiVersion: '2014-11-13' });
            return ecs.createCluster(params).promise();
        },
        listContainerInstances: (params: AWS.ECS.ListContainerInstancesRequest) => {
            const ecs = new AWS.ECS({ apiVersion: '2014-11-13' });
            return ecs.listContainerInstances(params).promise();
        },
        describeContainerInstances: (params: AWS.ECS.DescribeContainerInstancesRequest) => {
            const ecs = new AWS.ECS({ apiVersion: '2014-11-13' });
            return ecs.describeContainerInstances(params).promise();
        }
    },
    cloudWatchEvents: {
        putTargets: (params: AWS.CloudWatchEvents.PutTargetsRequest) => {
            const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
            return cloudWatchEvents.putTargets(params).promise();
        },
        listTargetsByRule: (params: AWS.CloudWatchEvents.ListTargetsByRuleRequest) => {
            const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
            return cloudWatchEvents.listTargetsByRule(params).promise();
        },
        listRules: (params: any) => {
            const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
            return cloudWatchEvents.listRules(params).promise();
        },
        removeTargets: (params: AWS.CloudWatchEvents.RemoveTargetsRequest) => {
            const cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
            return cloudWatchEvents.removeTargets(params).promise();
        }
    },
    lambda: {
        addPermission: (params: AWS.Lambda.AddPermissionRequest) => {
            const lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });
            return lambda.addPermission(params).promise();
        },
        getPolicy: (params: AWS.Lambda.GetPolicyRequest) => {
            const lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });
            return lambda.getPolicy(params).promise();
        },
        createEventSourceMapping: (params: AWS.Lambda.CreateEventSourceMappingRequest) => {
            const lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });
            return lambda.createEventSourceMapping(params).promise();
        },
        invoke: (params: AWS.Lambda.InvocationRequest) => {
            const lambda = new AWS.Lambda({ apiVersion: '2015-03-31' });
            return lambda.invoke(params).promise();
        }
    },
    route53: {
        listHostedZones: (params: AWS.Route53.ListHostedZonesRequest) => {
            const route53 = new AWS.Route53({apiVersion: '2013-04-01'});
            return route53.listHostedZones(params).promise();
        }
    },
    sqs: {
        getQueueAttributes: (params: AWS.SQS.GetQueueAttributesRequest) => {
            const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
            return sqs.getQueueAttributes(params).promise();
        },
        setQueueAttributes: (params: AWS.SQS.SetQueueAttributesRequest) => {
            const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
            return sqs.setQueueAttributes(params).promise();
        }
    },
    sns: {
        getTopicAttributes: (params: AWS.SNS.GetTopicAttributesInput) => {
            const sns = new AWS.SNS({apiVersion: '2010-03-31'});
            return sns.getTopicAttributes(params).promise();
        },
        setTopicAttributes: (params: AWS.SNS.SetTopicAttributesInput) => {
            const sns = new AWS.SNS({apiVersion: '2010-03-31'});
            return sns.setTopicAttributes(params).promise();
        },
        subscribe: (params: AWS.SNS.SubscribeInput) => {
            const sns = new AWS.SNS({apiVersion: '2010-03-31'});
            return sns.subscribe(params).promise();
        }
    }
};

export default awsWrapper;
