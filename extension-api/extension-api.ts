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
import { EC2 } from 'aws-sdk';

/***********************************
 * Types for the Extension contract
 ***********************************/

export interface Extension {
    loadHandelExtension(context: ExtensionContext): void | Promise<void>;
}

export interface ExtensionContext {
    service(name: string, deployer: ServiceDeployer): this;
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

    produceEvents?(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: DeployContext, eventConsumerConfig: ServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext): Promise<ProduceEventsContext>;

    unPreDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnPreDeployContext>;

    unBind?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnBindContext>;

    unDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnDeployContext>;
}

/***********************************
 * Types for the Account Config File
 ***********************************/
export interface AccountConfig {
    account_id: string;
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

export interface ServiceRegistry {
    getService(prefix: string, name: string): ServiceDeployer;
    getService(type: ServiceType): ServiceDeployer;

    hasService(prefix: string, name: string): boolean;
    hasService(type: ServiceType): boolean;

    allPrefixes(): Set<string>;
}

export interface ServiceType {
    prefix: string;
    name: string;

    matches(prefix: string, name: string): boolean;
}

export interface ServiceContext<Config extends ServiceConfig> {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
    params: Config;
    accountConfig: AccountConfig;

    serviceInfo: ServiceInfo;

    tags: Tags;
}

export interface ServiceInfo {
    producedEventsSupportedServices: string[];
    producedDeployOutputTypes: string[];
    consumedDeployOutputTypes: string[];
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

export interface IBindContext {
    dependencyServiceContext: ServiceContext<ServiceConfig>;
    dependentOfServiceContext: ServiceContext<ServiceConfig>;
}

export interface IConsumeEventsContext {
    consumingServiceContext: ServiceContext<ServiceConfig>;
    producingServiceContext: ServiceContext<ServiceConfig>;
}

export interface IDeployContext {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
    // Any outputs needed for producing/consuming events for this service
    eventOutputs: DeployContextEventOutputs;
    // Policies the consuming service can use when creating service roles in order to talk to this service
    policies: any[]; // There doesn't seem to be a great AWS-provided IAM type for Policy Documents
    // Items intended to be injected as environment variables into the consuming service
    environmentVariables: DeployContextEnvironmentVariables;
    // Scripts intended to be run on startup by the consuming resource.
    scripts: string[];
}

export interface IPreDeployContext {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
    securityGroups: EC2.SecurityGroup[];
}

export interface IProduceEventsContext {
    producingServiceContext: ServiceContext<ServiceConfig>;
    consumingServiceContext: ServiceContext<ServiceConfig>;
}

export interface IUnDeployContext {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
}

export interface IUnBindContext {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
}

export interface IUnPreDeployContext {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
}

export class BindContext implements IBindContext {
    public dependencyServiceContext: ServiceContext<ServiceConfig>;
    public dependentOfServiceContext: ServiceContext<ServiceConfig>;

    constructor(dependencyServiceContext: ServiceContext<ServiceConfig>,
                dependentOfServiceContext: ServiceContext<ServiceConfig>) {
        this.dependencyServiceContext = dependencyServiceContext;
        this.dependentOfServiceContext = dependentOfServiceContext;
        // Should anything else go here?
    }
}

export class ConsumeEventsContext implements IConsumeEventsContext {
    public consumingServiceContext: ServiceContext<ServiceConfig>;
    public producingServiceContext: ServiceContext<ServiceConfig>;

    constructor(consumingServiceContext: ServiceContext<ServiceConfig>,
                producingServiceContext: ServiceContext<ServiceConfig>) {
        this.consumingServiceContext = consumingServiceContext;
        this.producingServiceContext = producingServiceContext;
        // TODO - Does anything else go here?
    }
}

export class DeployContext implements IDeployContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: ServiceType;
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

export class PreDeployContext implements IPreDeployContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: ServiceType;
    public securityGroups: EC2.SecurityGroup[];

    constructor(serviceContext: ServiceContext<ServiceConfig>) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
        this.securityGroups = []; // Empty until service deployer fills it
    }
}

export class ProduceEventsContext implements IProduceEventsContext {
    public producingServiceContext: ServiceContext<ServiceConfig>;
    public consumingServiceContext: ServiceContext<ServiceConfig>;

    constructor(producingServiceContext: ServiceContext<ServiceConfig>,
                consumingServiceContext: ServiceContext<ServiceConfig>) {
        this.producingServiceContext = producingServiceContext;
        this.consumingServiceContext = consumingServiceContext;
        // Does anything else go here?
    }
}

export class UnDeployContext implements IUnDeployContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: ServiceType;

    constructor(serviceContext: ServiceContext<ServiceConfig>) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
    }
}

export class UnBindContext implements IUnBindContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: ServiceType;

    constructor(serviceContext: ServiceContext<ServiceConfig>) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
    }
}

export class UnPreDeployContext implements IUnPreDeployContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: ServiceType;

    constructor(serviceContext: ServiceContext<ServiceConfig>) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
    }
}

/***********************************
 * Other Types
 ***********************************/
export interface Tags {
    [key: string]: string;
}

export interface EnvironmentVariables {
    [key: string]: string;
}
