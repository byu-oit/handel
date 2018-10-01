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
import {
    DeployContext,
    DeployOutputType,
    PreDeployContext,
    ServiceContext,
    ServiceDeployer,
    Tags,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import { awsCalls, checkPhase, deletePhases, deployPhase, handlebars, preDeployPhase, tagging } from 'handel-extension-support';
import * as winston from 'winston';
import * as ec2Calls from '../../aws/ec2-calls';
import * as alb from './alb';
import * as asgLaunchConfig from './asg-launchconfig';
import { CodeDeployServiceConfig, HandlebarsCodeDeployTemplate } from './config-types';
import * as deployableArtifact from './deployable-artifact';
import * as iamRoles from './iam-roles';

const SERVICE_NAME = 'CodeDeploy';

async function getCompiledCodeDeployTemplate(stackName: string, ownServiceContext: ServiceContext<CodeDeployServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[], stackTags: Tags, userDataScript: string, s3ArtifactInfo: AWS.S3.ManagedUpload.SendData, amiToDeploy: AWS.EC2.Image): Promise<string> {
    const params = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const serviceRoleName = `${stackName}-service-role`;
    const policyStatements = await iamRoles.getStatementsForInstanceRole(ownServiceContext, dependenciesDeployContexts);
    const handlebarsParams: HandlebarsCodeDeployTemplate = {
        appName: stackName,
        policyStatements,
        amiImageId: amiToDeploy.ImageId!,
        instanceType: params.instance_type || 't2.micro',
        securityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        userData: new Buffer(userDataScript).toString('base64'),
        autoScaling: asgLaunchConfig.getAutoScalingConfig(ownServiceContext),
        routing: await alb.getRoutingConfig(stackName, ownServiceContext),
        tags: stackTags,
        privateSubnetIds: accountConfig.private_subnets,
        publicSubnetIds: accountConfig.public_subnets,
        vpcId: accountConfig.vpc,
        s3BucketName: s3ArtifactInfo.Bucket,
        s3KeyName: s3ArtifactInfo.Key,
        deploymentConfigName: 'CodeDeployDefault.OneAtATime', // TODO - Add support for multiple kinds later
        serviceRoleName: serviceRoleName,
        assignPublicIp: await ec2Calls.shouldAssignPublicIp(accountConfig.private_subnets)
    };

    // Add ssh key name if present
    if (params.key_name) {
        handlebarsParams.sshKeyName = params.key_name;
    }

    return handlebars.compileTemplate(`${__dirname}/codedeploy-asg-template.handlebars`, handlebarsParams);
}

export class Service implements ServiceDeployer {
    public readonly producedEventsSupportedTypes = [];
    public readonly producedDeployOutputTypes = [];
    public readonly consumedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.Scripts,
        DeployOutputType.Policies,
        DeployOutputType.Credentials,
        DeployOutputType.SecurityGroups
    ];
    public readonly providedEventType = null;
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<CodeDeployServiceConfig>): string[] {
        const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
        return errors.map(error => `${SERVICE_NAME} - ${error}`);
    }

    public async preDeploy(serviceContext: ServiceContext<CodeDeployServiceConfig>): Promise<PreDeployContext> {
        return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, 22, SERVICE_NAME);
    }

    public async getPreDeployContext(serviceContext: ServiceContext<CodeDeployServiceConfig>): Promise<PreDeployContext> {
        return preDeployPhase.getSecurityGroup(serviceContext);
    }

    public async deploy(ownServiceContext: ServiceContext<CodeDeployServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying application '${stackName}'`);

        const stackTags = tagging.getTags(ownServiceContext);
        const existingStack = await awsCalls.cloudFormation.getStack(stackName);
        const amiToDeploy = await asgLaunchConfig.getCodeDeployAmi();
        const shouldRollInstances = await asgLaunchConfig.shouldRollInstances(ownServiceContext, amiToDeploy, existingStack);
        const userDataScript = await asgLaunchConfig.getUserDataScript(ownServiceContext, dependenciesDeployContexts);
        const s3ArtifactInfo = await deployableArtifact.prepareAndUploadDeployableArtifactToS3(ownServiceContext, dependenciesDeployContexts, SERVICE_NAME);
        const codeDeployTemplate = await getCompiledCodeDeployTemplate(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, stackTags, userDataScript, s3ArtifactInfo, amiToDeploy);
        const deployedStack = await deployPhase.deployCloudFormationStack(ownServiceContext, stackName, codeDeployTemplate, [], true, 30, stackTags);

        // If we need to roll the instances (calculated prior to deploy) do so now
        if(shouldRollInstances) {
            winston.info('Change necessitated new EC2 instances. Rolling auto-scaling group to get new instances...');
            await asgLaunchConfig.rollInstances(ownServiceContext, deployedStack);
        }

        winston.info(`${SERVICE_NAME} - Finished deploying application '${stackName}'`);
        return new DeployContext(ownServiceContext);
    }

    public async unPreDeploy(ownServiceContext: ServiceContext<CodeDeployServiceConfig>): Promise<UnPreDeployContext> {
        return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
    }

    public async unDeploy(ownServiceContext: ServiceContext<CodeDeployServiceConfig>): Promise<UnDeployContext> {
        return deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
    }
}
