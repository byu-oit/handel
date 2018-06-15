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
    providedEventType: ServiceEventType | null;
    producedEventsSupportedTypes: ServiceEventType[];
    producedDeployOutputTypes: DeployOutputType[];
    consumedDeployOutputTypes: DeployOutputType[];
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

    bind?(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: IPreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: IPreDeployContext): Promise<IBindContext>;

    deploy?(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: IPreDeployContext, dependenciesDeployContexts: IDeployContext[]): Promise<IDeployContext>;

    consumeEvents?(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: IDeployContext, eventConsumerConfig: ServiceEventConsumer, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: IDeployContext): Promise<IConsumeEventsContext>;

    produceEvents?(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: IDeployContext, eventConsumerConfig: ServiceEventConsumer, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: IDeployContext): Promise<IProduceEventsContext>;

    unPreDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<IUnPreDeployContext>;

    unBind?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<IUnBindContext>;

    unDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<IUnDeployContext>;
}

export enum DeployOutputType {
    SecurityGroups = 'SecurityGroups',
    Policies = 'Policies',
    EnvironmentVariables = 'EnvironmentVariables',
    Scripts = 'Scripts',
    Credentials = 'Credentials'
}

export enum ServiceEventType {
    SNS = 'SNS',
    Lambda = 'Lambda',
    SQS = 'SQS',
    CloudWatchEvents = 'CloudWatchEvents',
    S3 = 'S3',
    DynamoDB = 'DynamoDB',
    IoT = 'IoT',
    AlexaSkillKit = 'AlexaSkillKit'
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

export function isAccountConfig(obj: any): obj is AccountConfig {
    return !!obj
        && (isString(obj.account_id) || isNumber(obj.account_id)) // We allow string or number here because Handel used to treat account_id as a number, but now treats it as a string
        && isString(obj.region)
        && isString(obj.vpc);
    // TODO: We could expand this more, but I'm not sure it's a good idea, since there may be a lot of variation between account config files.
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

export interface IServiceType {
    prefix: string;
    name: string;

    matches(prefix: string, name: string): boolean;
}

export function isServiceType(obj: any | ServiceType): obj is ServiceType {
    return !!obj
        && isString(obj.prefix)
        && isString(obj.name);
}

export interface IServiceContext<Config extends ServiceConfig> extends HasAppServiceInfo {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
    params: Config;
    accountConfig: AccountConfig;

    serviceInfo: ServiceInfo;

    tags: Tags;

    resourceName(): string;
    stackName(): string;
    injectedEnvVars(outputs: any): any;
    ssmApplicationPrefix(): string;
    ssmParamName(suffix: string): string;
}

export function isServiceContext(obj: any): obj is ServiceContext<ServiceConfig> {
    return !!obj
        && isServiceConfig(obj.params)
        && isAccountConfig(obj.accountConfig)
        && isTags(obj.tags)
        && hasAppServiceInfo(obj)
        ;
}

export interface ServiceInfo {
    producedEventsSupportedTypes: ServiceEventType[];
    producedDeployOutputTypes: string[];
    consumedDeployOutputTypes: string[];
}

export function isServiceInfo(obj: any): obj is ServiceInfo {
    return !!obj
        && isArray(obj.producedEventsSupportedTypes, isString)
        && isArray(obj.producedDeployOutputTypes, isString)
        && isArray(obj.consumedDeployOutputTypes, isString)
        ;
}

export interface ServiceConfig {
    type: string;
    tags?: Tags;
    event_consumers?: ServiceEventConsumer[];
    dependencies?: string[];
}

export function isServiceConfig(obj: any): obj is ServiceConfig {
    return !!obj
        && isString(obj.type)
        && (!obj.tags || isTags(obj.tags))
        && (!obj.dependencies || isArray(obj.dependencies, isString))
        ;
}

export interface ServiceEventConsumer {
    service_name: string;
}

export interface IBindContext {
    dependencyServiceContext: ServiceContext<ServiceConfig>;
    dependentOfServiceContext: ServiceContext<ServiceConfig>;
}

export function isBindContext(obj: any | IBindContext): obj is IBindContext {
    return !!obj
        && isServiceContext(obj.dependencyServiceContext)
        && isServiceContext(obj.dependentOfServiceContext);
}

export interface IConsumeEventsContext {
    consumingServiceContext: ServiceContext<ServiceConfig>;
    producingServiceContext: ServiceContext<ServiceConfig>;
}

export function isConsumeEventsContext(obj: any | IConsumeEventsContext): obj is IConsumeEventsContext {
    return !!obj
        && isServiceContext(obj.consumingServiceContext)
        && isServiceContext(obj.producingServiceContext)
        ;
}

export interface IDeployContext extends HasAppServiceInfo {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
    // Any outputs needed for producing/consuming events for this service
    eventOutputs: DeployContextEventOutputs | null;
    // Policies the consuming service can use when creating service roles in order to talk to this service
    policies: any[]; // There doesn't seem to be a great AWS-provided IAM type for Policy Documents
    // Items intended to be injected as environment variables into the consuming service
    environmentVariables: DeployContextEnvironmentVariables;
    // Scripts intended to be run on startup by the consuming resource.
    scripts: string[];

    addEnvironmentVariables(envVars: EnvironmentVariables): void;
}

export function isDeployContext(obj: any | IDeployContext): obj is IDeployContext {
    return !!obj
        && isDeployContextEventOutputs(obj.eventOutputs)
        && isArray(obj.policies)
        && isDeployContextEnvironmentVariables(obj.environmentVariables)
        && isArray(obj.scripts, isString)
        && hasAppServiceInfo(obj)
        ;
}

export interface DeployContextEnvironmentVariables {
    [key: string]: string;
}

export function isDeployContextEnvironmentVariables(obj: any | DeployContextEnvironmentVariables): obj is DeployContextEnvironmentVariables {
    return isHash(obj);
}

export interface DeployContextEventOutputs {
    resourceName?: string;
    resourceArn?: string;
    resourcePrincipal: string;
    serviceEventType: ServiceEventType;
}

export function isDeployContextEventOutputs(obj: any | DeployContextEventOutputs): obj is DeployContextEventOutputs {
    return isHash(obj) || obj == null;
}

export interface IPreDeployContext extends HasAppServiceInfo {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
    securityGroups: EC2.SecurityGroup[];
}

export function isPreDeployContext(obj: any | IPreDeployContext): obj is PreDeployContext {
    return !!obj
        && isArray(obj.securityGroups)
        && hasAppServiceInfo(obj)
        ;
}

export interface IProduceEventsContext {
    producingServiceContext: ServiceContext<ServiceConfig>;
    consumingServiceContext: ServiceContext<ServiceConfig>;
}

export function isProduceEventsContext(obj: any | IProduceEventsContext): obj is IProduceEventsContext {
    return !!obj
        && isServiceContext(obj.producingServiceContext)
        && isServiceContext(obj.consumingServiceContext);
}

export interface IUnDeployContext extends HasAppServiceInfo {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
}

export function isUnDeployContext(obj: any | IUnDeployContext): obj is IUnDeployContext {
    return !!obj && hasAppServiceInfo(obj);
}

export interface IUnBindContext extends HasAppServiceInfo {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
}

export function isUnBindContext(obj: any | IUnBindContext): obj is IUnBindContext {
    return !!obj && hasAppServiceInfo(obj);
}

export interface IUnPreDeployContext {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
}

export function isUnPreDeployContext(obj: any | IUnBindContext): obj is IUnPreDeployContext {
    return !!obj && hasAppServiceInfo(obj);
}

export interface HasAppServiceInfo {
    appName: string;
    environmentName: string;
    serviceName: string;
    serviceType: ServiceType;
}

export function hasAppServiceInfo(obj: any | HasAppServiceInfo): obj is HasAppServiceInfo {
    return !!obj
        && isString(obj.appName)
        && isString(obj.environmentName)
        && isString(obj.serviceName)
        && isServiceType(obj.serviceType);
}

export class ServiceContext<Config extends ServiceConfig> implements IServiceContext<Config> {
    constructor(public appName: string,
                public environmentName: string,
                public serviceName: string,
                public serviceType: ServiceType,
                public params: Config,
                public accountConfig: AccountConfig,
                public tags: Tags = {},
                public serviceInfo: ServiceInfo = {
                    consumedDeployOutputTypes: [],
                    producedDeployOutputTypes: [],
                    producedEventsSupportedTypes: []
                }) {
    }

    public resourceName(): string {
        return `${this.appName}-${this.environmentName}-${this.serviceName}`;
    }

    public stackName(): string {
        return `${this.resourceName()}-${this.serviceType.name}`;
    }

    public injectedEnvVars() {
        const envVars: EnvironmentVariables = {};
        envVars.HANDEL_APP_NAME = this.appName;
        envVars.HANDEL_ENVIRONMENT_NAME = this.environmentName;
        envVars.HANDEL_SERVICE_NAME = this.serviceName;
        envVars.HANDEL_PARAMETER_STORE_PREFIX = this.ssmApplicationPrefix();
        return envVars;
    }

    public ssmParamName(suffix: string) {
        const prefix = `${this.ssmApplicationPrefix()}.${this.serviceName}`;
        return `${prefix}.${suffix}`;
    }

    public ssmApplicationPrefix(): string {
        return `${this.appName}.${this.environmentName}`;
    }
}

export class ServiceType implements IServiceType {
    constructor(public prefix: string, public name: string) {
    }

    public matches(prefix: string, name: string): boolean {
        return this.prefix === prefix && this.name === name;
    }

    public toString(): string {
        return this.prefix + '::' + this.name;
    }
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
    public eventOutputs: DeployContextEventOutputs | null;
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
        this.eventOutputs = null;
        this.policies = [];
        this.environmentVariables = {};
        this.scripts = [];
    }

    public addEnvironmentVariables(envVars: EnvironmentVariables) {
        const formattedVars = Object.keys(envVars)
            .reduce((obj: any, name) => {
                const envName = this.getInjectedEnvVarName(name);
                obj[envName] = envVars[name];
                return obj;
            }, {});
        Object.assign(this.environmentVariables, formattedVars);
    }

    public getInjectedEnvVarName(suffix: string) {
        return `${this.serviceName}_${suffix}`.toUpperCase().replace(/-/g, '_');
    }
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

export function isTags(obj: any): obj is Tags {
    return isHash(obj);
}

export interface EnvironmentVariables {
    [key: string]: string;
}

export function isEnvironmentVariables(obj: any): obj is EnvironmentVariables {
    return isHash(obj);
}

export function isHash(obj: any): boolean {
    return !!obj && typeof obj === 'object';
}

function isArray(value: any, itemType?: (obj: any) => boolean) {
    return Array.isArray(value) && (!itemType || value.every(itemType));
}

function isString(value: any) {
    return typeof value === 'string';
}

function isNumber(value: any) {
    return typeof value === 'number';
}
