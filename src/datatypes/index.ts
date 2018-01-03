/*
 * Copyright 2017 Brigham Young University
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
    ssh_bastion_sg: string;
    elasticache_subnet_group: string;
    rds_subnet_group: string;
    redshift_subnet_group: string;
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

    constructor(appName: string,
                environmentName: string,
                serviceName: string,
                serviceType: string,
                params: Config,
                accountConfig: AccountConfig) {
            this.appName = appName;
            this.environmentName = environmentName;
            this.serviceName = serviceName;
            this.serviceType = serviceType;
            this.params = params;
            this.accountConfig = accountConfig;
    }
}

export interface ServiceConfig {
    type: string;
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
export enum DeployOutputType {
    environmentVariables, scripts, policies, credentials, securityGroups
}

export interface ServiceDeployer {
    producedEventsSupportedServices: string[];
    producedDeployOutputTypes: DeployOutputType[];
    consumedDeployOutputTypes: DeployOutputType[];
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

/***********************************
 * Types for the Handel File
 ***********************************/
export interface HandelFile {
    version: number;
    name: string;
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
    public serviceContexts: any;
    public accountConfig: AccountConfig;

    constructor(appName: string,
                environmentName: string,
                accountConfig: AccountConfig) {
        this.appName = appName;
        this.environmentName = environmentName;
        this.serviceContexts = {};
        this.accountConfig = accountConfig;
    }
}

export class EnvironmentDeleteResult {
    public status: string;
    public message: string;
    public error: Error;

    constructor(status: string,
                message: string,
                error: Error) {
        this.status = status;
        this.message = message;
        this.error = error;
    }
}

export class EnvironmentDeployResult {
    public status: string;
    public message: string;
    public error: Error;

    constructor(status: string,
                message: string,
                error: Error) {
        this.status = status;
        this.message = message;
        this.error = error;
    }
}

/***********************************
 * Other Types
 ***********************************/
export interface Tags {
    [key: string]: string;
}
