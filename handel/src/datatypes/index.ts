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
import * as AWS from 'aws-sdk';

/***********************************
 * Types for the Account Config File
 ***********************************/
export interface AccountConfig {
    account_id: number;
    region: string;
    vpc: string;
    public_subnets: string[];
    private_subnets: string[];
    data_subnets: string[];
    ssh_bastion_sg?: string;
    elasticache_subnet_group: string;
    rds_subnet_group: string;
    redshift_subnet_group: string;
    required_tags?: string[];
    handel_resource_tags?: Tags;
    // Allow for account config extensions. Allows future plugins to have their own account-level settings.
    [key: string]: any;
}

/***********************************
 * Types for the context objects used by service deployers
 ***********************************/
export class ServiceContext<Config extends ServiceConfig> {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: string;
    public params: Config;
    public accountConfig: AccountConfig;
    public tags: Tags;

    constructor(appName: string,
                environmentName: string,
                serviceName: string,
                serviceType: string,
                params: Config,
                accountConfig: AccountConfig,
                tags: Tags = {}) {
            this.appName = appName;
            this.environmentName = environmentName;
            this.serviceName = serviceName;
            this.serviceType = serviceType;
            this.params = params;
            this.accountConfig = accountConfig;
            this.tags = tags;
    }
}

export interface ServiceConfig {
    type: string;
    tags?: Tags;
    event_consumers?: ServiceEventConsumer[];
    dependencies?: string[];
}

export interface ServiceEventConsumer {
    service_name: string;
}

export class BindContext {
    public dependencyServiceContext: ServiceContext<ServiceConfig>;
    public dependentOfServiceContext: ServiceContext<ServiceConfig>;

    constructor(dependencyServiceContext: ServiceContext<ServiceConfig>,
                dependentOfServiceContext: ServiceContext<ServiceConfig>) {
        this.dependencyServiceContext = dependencyServiceContext;
        this.dependentOfServiceContext = dependentOfServiceContext;
        // Should anything else go here?
    }
}

export class ConsumeEventsContext {
    public consumingServiceContext: ServiceContext<ServiceConfig>;
    public producingServiceContext: ServiceContext<ServiceConfig>;

    constructor(consumingServiceContext: ServiceContext<ServiceConfig>,
                producingServiceContext: ServiceContext<ServiceConfig>) {
        this.consumingServiceContext = consumingServiceContext;
        this.producingServiceContext = producingServiceContext;
        // TODO - Does anything else go here?
    }
}

export class DeployContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: string;
    // Any outputs needed for producing/consuming events for this service
    public eventOutputs: DeployContextEventOutputs;
    // Policies the consuming service can use when creating service roles in order to talk to this service
    public policies: any[]; // There doesn't seem to be a great AWS-provided IAM type for Policy Documents
    // Items intended to be injected as environment variables into the consuming service
    public environmentVariables: DeployContextEnvironmentVariables;
    // Scripts intended to be run on startup by the consuming resource.
    public scripts: string[];

    constructor(serviceContext: ServiceContext<ServiceConfig>) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
        this.eventOutputs = {};
        this.policies = [];
        this.environmentVariables = {};
        this.scripts = [];
    }

    public addEnvironmentVariables(vars: object) {
        Object.assign(this.environmentVariables, vars);
    }
}

export interface DeployContextEnvironmentVariables {
    [key: string]: string;
}

export interface DeployContextEventOutputs {
    [key: string]: any;
}

export class PreDeployContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: string;
    public securityGroups: AWS.EC2.SecurityGroup[];

    constructor(serviceContext: ServiceContext<ServiceConfig>) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
        this.securityGroups = []; // Empty until service deployer fills it
    }
}

export class ProduceEventsContext {
    public producingServiceContext: ServiceContext<ServiceConfig>;
    public consumingServiceContext: ServiceContext<ServiceConfig>;

    constructor(producingServiceContext: ServiceContext<ServiceConfig>,
                consumingServiceContext: ServiceContext<ServiceConfig>) {
        this.producingServiceContext = producingServiceContext;
        this.consumingServiceContext = consumingServiceContext;
        // Does anything else go here?
    }
}

export class UnDeployContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: string;

    constructor(serviceContext: ServiceContext<ServiceConfig>) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
    }
}

export class UnBindContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: string;

    constructor(serviceContext: ServiceContext<ServiceConfig>) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
    }
}

export class UnPreDeployContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: string;

    constructor(serviceContext: ServiceContext<ServiceConfig>) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
    }
}

/***********************************
 * Types for the Service Deployer contract
 ***********************************/
export interface ServiceDeployer {
    producedEventsSupportedServices: string[];
    producedDeployOutputTypes: string[];
    consumedDeployOutputTypes: string[];
    /**
     * If true, indicates that a deployer supports tagging its resources. This is used to enforce tagging rules.
     *
     * If not specified, 'true' is assumed, effectively making tagging enforcement opt-out.
     *
     * If the deployer deploys anything to Cloudformation, it should declare that it supports tagging.
     */
    supportsTagging: boolean;
    check?(serviceContext: ServiceContext<ServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[];
    preDeploy?(serviceContext: ServiceContext<ServiceConfig>): Promise<PreDeployContext>;
    bind?(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<BindContext>;
    deploy?(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext>;
    consumeEvents?(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: DeployContext, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext): Promise<ConsumeEventsContext>;
    produceEvents?(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: DeployContext, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext): Promise<ProduceEventsContext>;
    unPreDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnPreDeployContext>;
    unBind?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnBindContext>;
    unDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnDeployContext>;
}

export interface ServiceDeployers {
    [key: string]: ServiceDeployer;
}

/************************************
 * Types for the HandelFileParser contract
 ************************************/
export interface HandelFileParser {
    validateHandelFile(handelFile: HandelFile, serviceDeployers: ServiceDeployers): string[];
    createEnvironmentContext(handelFile: HandelFile, environmentName: string, accountConfig: AccountConfig): EnvironmentContext;
}

/***********************************
 * Types for the Handel File
 ***********************************/
export interface HandelFile {
    version: number;
    name: string;
    tags?: Tags;
    environments: HandelFileEnvironments;
}

export interface HandelFileEnvironments {
    [environmentName: string]: HandelFileEnvironment;
}

export interface HandelFileEnvironment {
    [serviceName: string]: ServiceConfig;
}

/***********************************
 * Types for the Environment Deployer framework and lifecycle
 ***********************************/
export class EnvironmentContext {
    public appName: string;
    public environmentName: string;
    public serviceContexts: ServiceContexts;
    public accountConfig: AccountConfig;
    public tags: Tags;

    constructor(appName: string,
                environmentName: string,
                accountConfig: AccountConfig,
                tags: Tags = {}) {
        this.appName = appName;
        this.environmentName = environmentName;
        this.serviceContexts = {};
        this.accountConfig = accountConfig;
        this.tags = tags;
    }
}

export interface EnvironmentResult {
    status: string;
    message: string;
    error?: Error;
}

export class EnvironmentDeleteResult implements EnvironmentResult {
    public status: string;
    public message: string;
    public error: Error | undefined;

    constructor(status: string,
                message: string,
                error?: Error) {
        this.status = status;
        this.message = message;
        this.error = error;
    }
}

export class EnvironmentDeployResult implements EnvironmentResult {
    public status: string;
    public message: string;
    public error: Error | undefined;

    constructor(status: string,
                message: string,
                error?: Error) {
        this.status = status;
        this.message = message;
        this.error = error;
    }
}

export interface EnvironmentsCheckResults {
    [environmentName: string]: string[];
}

export interface ServiceContexts {
    [serviceName: string]: ServiceContext<ServiceConfig>;
}

export interface PreDeployContexts {
    [serviceName: string]: PreDeployContext;
}

export interface BindContexts {
    [bindContextName: string]: BindContext;
}

export interface DeployContexts {
    [serviceName: string]: DeployContext;
}

export interface ConsumeEventsContexts {
    [serviceName: string]: ConsumeEventsContext;
}

export interface ProduceEventsContexts {
    [serviceName: string]: ProduceEventsContext;
}

export interface UnBindContexts {
    [serviceName: string]: UnBindContext;
}

export interface UnDeployContexts {
    [serviceName: string]: UnDeployContext;
}

export interface UnPreDeployContexts {
    [serviceName: string]: UnPreDeployContext;
}

export type DeployOrder = string[][];

/***********************************
 * Other Types
 ***********************************/
export interface Tags {
    [key: string]: string;
}

export interface EnvironmentVariables {
    [key: string]: string;
}
