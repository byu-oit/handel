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
import * as uuid from 'uuid';
import * as winston from 'winston';
import * as ec2Calls from '../../aws/ec2-calls';
import * as route53 from '../../aws/route53-calls';
import * as bindPhaseCommon from '../../common/bind-phase-common';
import * as deletePhasesCommon from '../../common/delete-phases-common';
import * as deployPhaseCommon from '../../common/deploy-phase-common';
import * as handlebarsUtils from '../../common/handlebars-utils';
import * as preDeployPhaseCommon from '../../common/pre-deploy-phase-common';
import * as taggingCommon from '../../common/tagging-common';
import * as util from '../../common/util';
import { AccountConfig, DeployContext, PreDeployContext, ServiceConfig, ServiceContext, Tags, UnDeployContext, UnPreDeployContext } from '../../datatypes';
import { CodeDeployServiceConfig, HandlebarsCodeDeployAutoScalingConfig, HandlebarsCodeDeployRoutingConfig, HandlebarsCodeDeployTemplate } from './config-types';

const SERVICE_NAME = 'CodeDeploy';

async function getStatementsForInstanceRole(ownServiceContext: ServiceContext<CodeDeployServiceConfig>, dependenciesDeployContexts: DeployContext[]): Promise<any[]> {
    const accountConfig = ownServiceContext.accountConfig;
    const ownPolicyStatementsTemplate = `${__dirname}/codedeploy-instance-role-statements.json`;
    const handlebarsParams = {
        region: accountConfig.region,
        handelBucketName: deployPhaseCommon.getHandelUploadsBucketName(accountConfig)
    };
    const compiledPolicyStatements = await handlebarsUtils.compileTemplate(ownPolicyStatementsTemplate, handlebarsParams);
    let ownPolicyStatements = JSON.parse(compiledPolicyStatements);
    ownPolicyStatements = ownPolicyStatements.concat(deployPhaseCommon.getAppSecretsAccessPolicyStatements(ownServiceContext));
    return deployPhaseCommon.getAllPolicyStatementsForServiceRole(ownPolicyStatements, dependenciesDeployContexts);
}

async function getAmiFromPrefix(): Promise<AWS.EC2.Image> {
    // Just use the AWS AMI for now
    const ami = await ec2Calls.getLatestAmiByName('amazon', 'amzn-ami-hvm');
    if (!ami) {
        throw new Error('Could not find the latest Amazon AMI');
    }
    return ami;
}

function getAutoScalingConfig(ownServiceContext: ServiceContext<CodeDeployServiceConfig>): HandlebarsCodeDeployAutoScalingConfig {
    const params = ownServiceContext.params;
    const autoScalingConfig: HandlebarsCodeDeployAutoScalingConfig = { // Set initial defaults
        minInstances: 1,
        maxInstances: 1,
        cooldown: '300' // TODO - Change this when scaling is implemented
    };
    if(params.auto_scaling) {
        if(params.auto_scaling.min_instances) { autoScalingConfig.minInstances = params.auto_scaling.min_instances; }
        if(params.auto_scaling.max_instances) { autoScalingConfig.maxInstances = params.auto_scaling.max_instances; }
    }
    return autoScalingConfig;
}

async function getRoutingConfig(stackName: string, ownServiceContext: ServiceContext<CodeDeployServiceConfig>): Promise<HandlebarsCodeDeployRoutingConfig | undefined> {
    const params = ownServiceContext.params;
    if(params.routing) {
        const routingConfig: HandlebarsCodeDeployRoutingConfig = {
            albName: stackName.substring(0, 32).replace(/-$/, ''), // Configure the shortened ALB name (it has a limit of 32 chars)
            basePath: params.routing.base_path ? params.routing.base_path : '/',
            healthCheckPath: params.routing.health_check_path ? params.routing.health_check_path : '/'
        };
        if(params.routing.type === 'https') {
            routingConfig.httpsCertificate = params.routing.https_certificate;
        }
        if(params.routing.dns_names) { // Add DNS names if specified
            const hostedZones = await route53.listHostedZones();
            routingConfig.dnsNames = params.routing.dns_names.map(name => {
                return {
                    name: name,
                    zoneId: route53.getBestMatchingHostedZone(name, hostedZones)!.Id
                };
            });
        }
        return routingConfig;
    }
}

async function getCompiledCodeDeployTemplate(stackName: string, ownServiceContext: ServiceContext<CodeDeployServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[], stackTags: Tags, userDataScript: string, serviceRole: AWS.IAM.Role, s3ArtifactInfo: AWS.S3.ManagedUpload.SendData): Promise<string> {
    const params = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const ami = await getAmiFromPrefix();
    const policyStatements = await getStatementsForInstanceRole(ownServiceContext, dependenciesDeployContexts);
    const handlebarsParams: HandlebarsCodeDeployTemplate = {
        appName: stackName,
        policyStatements,
        amiImageId: ami.ImageId!,
        instanceType: params.instance_type || 't2.micro',
        securityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        userData: new Buffer(userDataScript).toString('base64'),
        autoScaling: getAutoScalingConfig(ownServiceContext),
        routing: await getRoutingConfig(stackName, ownServiceContext),
        tags: stackTags,
        privateSubnetIds: accountConfig.private_subnets,
        s3BucketName: s3ArtifactInfo.Bucket,
        s3KeyName: s3ArtifactInfo.Key,
        deploymentConfigName: 'CodeDeployDefault.OneAtATime', // TODO - Add support for multiple kinds later
        serviceRoleArn: serviceRole.Arn
    };

    // Add ssh key name if present
    if (params.key_name) {
        handlebarsParams.sshKeyName = params.key_name;
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/codedeploy-asg-template.yml`, handlebarsParams);
}

async function createCodeDeployServiceRoleIfNotExists(ownServiceContext: ServiceContext<CodeDeployServiceConfig>): Promise<AWS.IAM.Role> {
    const accountConfig = ownServiceContext.accountConfig;
    const policyStatements = JSON.parse(util.readFileSync(`${__dirname}/codedeploy-service-role-statements.json`));
    const createdRole = await deployPhaseCommon.createCustomRole('codedeploy.amazonaws.com', 'HandelCodeDeployServiceRole', policyStatements, accountConfig);
    if (!createdRole) {
        throw new Error('Expected role to be created for CodeDeploy service, but none was returned');
    }
    return createdRole;
}

async function getUserDataScript(ownServiceContext: ServiceContext<CodeDeployServiceConfig>, dependenciesDeployContexts: DeployContext[]): Promise<string> {
    const params = ownServiceContext.params;

    // Add scripts from dependencies
    const dependencyScripts: string[] = [];
    for (const deployContext of dependenciesDeployContexts) {
        for (const script of deployContext.scripts) {
            dependencyScripts.push(script);
        }
    }
    const agentInstallVariables = {
        region: ownServiceContext.accountConfig.region
    };
    const codeDeployInstallScript = await handlebarsUtils.compileTemplate(`${__dirname}/codedeploy-agent-install-fragment.sh`, agentInstallVariables);

    const userdataVariables = {
        dependencyScripts,
        codeDeployInstallScript
    };
    return handlebarsUtils.compileTemplate(`${__dirname}/codedeploy-instance-userdata-template.sh`, userdataVariables);
}

async function uploadDeployableArtifactToS3(serviceContext: ServiceContext<CodeDeployServiceConfig>): Promise<AWS.S3.ManagedUpload.SendData> {
    const s3FileName = `codedeploy-deployable-${uuid()}.zip`;
    winston.info(`${SERVICE_NAME} - Uploading deployable artifact to S3: ${s3FileName}`);
    const pathToArtifact = serviceContext.params.path_to_code;
    const s3ArtifactInfo = await deployPhaseCommon.uploadDeployableArtifactToHandelBucket(serviceContext, pathToArtifact, s3FileName);
    winston.info(`${SERVICE_NAME} - Uploaded deployable artifact to S3: ${s3FileName}`);
    return s3ArtifactInfo;
}

/**
 * Service Deployer Contract Methods
 * See https://github.com/byu-oit-appdev/handel/wiki/Creating-a-New-Service-Deployer#service-deployer-contract
 *   for contract method documentation
 */

export function check(serviceContext: ServiceContext<CodeDeployServiceConfig>): string[] {
    const errors: string[] = [];
    const serviceParams = serviceContext.params;
    // TODO - Add check metho
    return errors;
}

export async function preDeploy(serviceContext: ServiceContext<CodeDeployServiceConfig>): Promise<PreDeployContext> {
    return preDeployPhaseCommon.preDeployCreateSecurityGroup(serviceContext, 22, SERVICE_NAME);
}

export async function deploy(ownServiceContext: ServiceContext<CodeDeployServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
    const stackName = deployPhaseCommon.getResourceName(ownServiceContext);
    winston.info(`${SERVICE_NAME} - Deploying application '${stackName}'`);

    const stackTags = taggingCommon.getTags(ownServiceContext);
    const serviceRole = await createCodeDeployServiceRoleIfNotExists(ownServiceContext);
    const userDataScript = await getUserDataScript(ownServiceContext, dependenciesDeployContexts);
    const s3ArtifactInfo = await uploadDeployableArtifactToS3(ownServiceContext);
    const codeDeployTemplate = await getCompiledCodeDeployTemplate(stackName, ownServiceContext, ownPreDeployContext, dependenciesDeployContexts, stackTags, userDataScript, serviceRole, s3ArtifactInfo);
    const deployedStack = await deployPhaseCommon.deployCloudFormationStack(stackName, codeDeployTemplate, [], true, SERVICE_NAME, 30, stackTags);
    winston.info(`${SERVICE_NAME} - Finished deploying application '${stackName}'`);
    return new DeployContext(ownServiceContext);
}

export async function unPreDeploy(ownServiceContext: ServiceContext<CodeDeployServiceConfig>): Promise<UnPreDeployContext> {
    return deletePhasesCommon.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
}

export async function unDeploy(ownServiceContext: ServiceContext<CodeDeployServiceConfig>): Promise<UnDeployContext> {
    return deletePhasesCommon.unDeployService(ownServiceContext, SERVICE_NAME);
}

exports.producedEventsSupportedServices = [];

exports.producedDeployOutputTypes = [];

exports.consumedDeployOutputTypes = [
    'environmentVariables',
    'scripts',
    'policies',
    'credentials',
    'securityGroups'
];

export const supportsTagging = true;
