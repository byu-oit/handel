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
import * as fs from 'fs';
import {
    BindContext,
    DeployContext,
    DeployOutputType,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    ServiceDeployer,
    UnBindContext,
    UnDeployContext,
    UnPreDeployContext
} from 'handel-extension-api';
import {
    awsCalls,
    bindPhase,
    checkPhase,
    deletePhases,
    deployPhase,
    handlebars,
    preDeployPhase,
    tagging
} from 'handel-extension-support';
import * as uuid from 'uuid/v4';
import * as winston from 'winston';
import { AmazonMQServiceConfig, HandlebarsAmazonMQTemplate } from './config-types';

const SERVICE_NAME = 'AmazonMQ';
const AMAZON_MQ_PROTOCOL = 'tcp';
const AMAZON_MQ_WEB_PORT = 8162;
const AMAZON_MQ_PORTS = [
    5671, // AMQP
    8883, // MQTT
    61614, // STOMP
    61617, // OpenWire
    61619 // WSS
];

// This is pretty hacky...better add a good crypto random string soon
function getNewBrokerUsername() {
    return uuid();
}

// This is somewhat hacky...better add a good crypto random string soon
function getNewBrokerPassword() {
    return uuid();
}

function getConfiguration(serviceParams: AmazonMQServiceConfig): string | undefined {
    const configPath = serviceParams.configuration;
    if(configPath) {
        if (fs.existsSync(configPath)) {
            try {
                const configuration = fs.readFileSync(configPath, 'utf8');
                return Buffer.from(configuration).toString('base64');
            }
            catch (err) {
                throw new Error(`Couldn't load your ActiveMQ XML configuration file at: ${configPath}.`);
            }
        }
    }
}

async function getDeployContext(serviceContext: ServiceContext<AmazonMQServiceConfig>, deployedStack: AWS.CloudFormation.Stack): Promise<DeployContext> {
    const deployContext = new DeployContext(serviceContext);

    const brokerId = awsCalls.cloudFormation.getOutput('BrokerId', deployedStack);
    if(!brokerId) {
        throw new Error('Expected to receive broker ID back from AmazonMQ service');
    }
    deployContext.addEnvironmentVariables({
        BROKER_ID: brokerId
    });

    return deployContext;
}

async function getCompiledTemplate(ownServiceContext: ServiceContext<AmazonMQServiceConfig>, ownPreDeployContext: PreDeployContext): Promise<string> {
    const accountConfig = ownServiceContext.accountConfig;
    const serviceParams = ownServiceContext.params;
    const brokerName = ownServiceContext.resourceName();

    const handlebarsParams: HandlebarsAmazonMQTemplate = {
        brokerName: brokerName,
        engineType: 'ACTIVEMQ', // Only currently supported value by AmazonMQ
        engineVersion: '5.15.0', // Only currently supported value by AmazonMQ
        instanceType: serviceParams.instance_type || 'mq.t2.micro',
        securityGroupId: ownPreDeployContext.securityGroups[0].GroupId!,
        subnetId1: accountConfig.data_subnets[0],
        generalLogging: serviceParams.general_logging || false,
        auditLogging: serviceParams.audit_logging || false,
        configurationBase64EncodedXml: getConfiguration(serviceParams)
    };
    if(serviceParams.multi_az === true) {
        if(!(accountConfig.data_subnets.length > 0)) {
            throw new Error(`You have requested a multi-AZ deployment for your AmazonMQ broker '${brokerName}', but your account config file only specifies a single subnet`);
        }
        handlebarsParams.subnetId2 = accountConfig.data_subnets[1];
    }
    return handlebars.compileTemplate(`${__dirname}/amazonmq-template.yml`, handlebarsParams);
}

export class Service implements ServiceDeployer {
    public readonly producedDeployOutputTypes = [
        DeployOutputType.EnvironmentVariables,
        DeployOutputType.SecurityGroups
    ];
    public readonly consumedDeployOutputTypes = [];
    public readonly producedEventsSupportedTypes = [];
    public readonly providedEventType = null;
    public readonly supportsTagging = true;

    public check(serviceContext: ServiceContext<AmazonMQServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[] {
        const errors: string[] = checkPhase.checkJsonSchema(`${__dirname}/params-schema.json`, serviceContext);
        return errors.map(error => `${SERVICE_NAME} - ${error}`);
    }

    public async preDeploy(serviceContext: ServiceContext<AmazonMQServiceConfig>): Promise<PreDeployContext> {
        return preDeployPhase.preDeployCreateSecurityGroup(serviceContext, AMAZON_MQ_WEB_PORT, SERVICE_NAME);
    }

    public async getPreDeployContext(serviceContext: ServiceContext<AmazonMQServiceConfig>): Promise<PreDeployContext> {
        return preDeployPhase.getSecurityGroup(serviceContext);
    }

    public async bind(ownServiceContext: ServiceContext<AmazonMQServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<BindContext> {
        return bindPhase.bindDependentSecurityGroup(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, AMAZON_MQ_PROTOCOL, AMAZON_MQ_PORTS);
    }

    public async deploy(ownServiceContext: ServiceContext<AmazonMQServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext> {
        const stackName = ownServiceContext.stackName();
        winston.info(`${SERVICE_NAME} - Deploying broker '${stackName}'`);
        const stack = await awsCalls.cloudFormation.getStack(stackName);
        if(!stack) {
            const brokerUsername = getNewBrokerUsername();
            const brokerPassword = getNewBrokerPassword();
            const compiledTemplate = await getCompiledTemplate(ownServiceContext, ownPreDeployContext);
            const cfParameters = awsCalls.cloudFormation.getCfStyleStackParameters({
                BrokerUsername: brokerUsername,
                BrokerPassword: brokerPassword
            });
            const stackTags = tagging.getTags(ownServiceContext);
            const deployedStack = await awsCalls.cloudFormation.createStack(stackName,
                compiledTemplate,
                cfParameters,
                30,
                stackTags);

            // Add broker credentials to the Parameter Store
            await Promise.all([
                deployPhase.addItemToSSMParameterStore(ownServiceContext, 'broker_username', brokerUsername),
                deployPhase.addItemToSSMParameterStore(ownServiceContext, 'broker_password', brokerPassword)
            ]);
            winston.info(`${SERVICE_NAME} - Finished deploying broker '${stackName}'`);
            return getDeployContext(ownServiceContext, deployedStack);
        }
        else {
            winston.info(`${SERVICE_NAME} - Updates are not supported for this service.`);
            return getDeployContext(ownServiceContext, stack);
        }
    }

    public async unPreDeploy(ownServiceContext: ServiceContext<AmazonMQServiceConfig>): Promise<UnPreDeployContext> {
        return deletePhases.unPreDeploySecurityGroup(ownServiceContext, SERVICE_NAME);
    }

    public async unBind(ownServiceContext: ServiceContext<AmazonMQServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<UnBindContext> {
        return deletePhases.unBindService(ownServiceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, AMAZON_MQ_PROTOCOL, AMAZON_MQ_PORTS);
    }

    public async unDeploy(ownServiceContext: ServiceContext<AmazonMQServiceConfig>): Promise<UnDeployContext> {
        const unDeployContext = deletePhases.unDeployService(ownServiceContext, SERVICE_NAME);
        await deletePhases.deleteServiceItemsFromSSMParameterStore(ownServiceContext, ['broker_username', 'broker_password']);
        return unDeployContext;
    }
}
