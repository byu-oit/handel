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

import * as api from 'handel-extension-api';

/*******************************************************************************************************************
 * A number of these types are just aliases or extensions of the types in the extension API. This allows us to keep
 * our types compatible while adding any internal extras we may need.
 ******************************************************************************************************************/

// tslint:disable:no-empty-interface

/***********************************
 * Types for the Account Config File
 ***********************************/
export interface AccountConfig extends api.AccountConfig {
}

/***********************************
 * Types for the context objects used by service deployers
 ***********************************/
export class ServiceContext<Config extends ServiceConfig> implements api.ServiceContext<Config> {

    constructor(public appName: string,
                public environmentName: string,
                public serviceName: string,
                public serviceType: string,
                public params: Config,
                public accountConfig: AccountConfig,
                public tags: Tags = {},
                public serviceInfo: api.ServiceInfo = {
                    consumedDeployOutputTypes: [],
                    producedDeployOutputTypes: [],
                    producedEventsSupportedServices: []
                }
    ) {
    }
}

export interface ServiceConfig extends api.ServiceConfig {
}

export interface ServiceEventConsumer extends api.ServiceEventConsumer {
}

export class BindContext implements api.BindContext {
    public dependencyServiceContext: ServiceContext<ServiceConfig>;
    public dependentOfServiceContext: ServiceContext<ServiceConfig>;

    constructor(dependencyServiceContext: ServiceContext<ServiceConfig>,
                dependentOfServiceContext: ServiceContext<ServiceConfig>) {
        this.dependencyServiceContext = dependencyServiceContext;
        this.dependentOfServiceContext = dependentOfServiceContext;
        // Should anything else go here?
    }
}

export class ConsumeEventsContext implements api.ConsumeEventsContext {
    public consumingServiceContext: ServiceContext<ServiceConfig>;
    public producingServiceContext: ServiceContext<ServiceConfig>;

    constructor(consumingServiceContext: ServiceContext<ServiceConfig>,
                producingServiceContext: ServiceContext<ServiceConfig>) {
        this.consumingServiceContext = consumingServiceContext;
        this.producingServiceContext = producingServiceContext;
        // TODO - Does anything else go here?
    }
}

export class DeployContext implements api.DeployContext {
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

export class PreDeployContext implements api.PreDeployContext {
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

export class ProduceEventsContext implements api.ProduceEventsContext {
    public producingServiceContext: ServiceContext<ServiceConfig>;
    public consumingServiceContext: ServiceContext<ServiceConfig>;

    constructor(producingServiceContext: ServiceContext<ServiceConfig>,
                consumingServiceContext: ServiceContext<ServiceConfig>) {
        this.producingServiceContext = producingServiceContext;
        this.consumingServiceContext = consumingServiceContext;
        // Does anything else go here?
    }
}

export class UnDeployContext implements api.UnDeployContext {
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

export class UnBindContext implements api.UnBindContext {
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

export class UnPreDeployContext implements api.UnPreDeployContext {
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
export interface ServiceDeployer extends api.ServiceDeployer {
}

/************************************
 * Types for the HandelFileParser contract
 ************************************/
export interface HandelFileParser {
    validateHandelFile(handelFile: HandelFile, serviceRegistry: api.ServiceRegistry): Promise<string[]>;

    createEnvironmentContext(handelFile: HandelFile, environmentName: string, accountConfig: AccountConfig, serviceRegistry: api.ServiceRegistry, options: GlobalOptions): EnvironmentContext;
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
    public serviceContexts: ServiceContexts;

    constructor(public appName: string,
                public environmentName: string,
                public accountConfig: AccountConfig,
                public options: GlobalOptions = {debug: false, linkExtensions: false},
                public tags: Tags = {}) {
        this.serviceContexts = {};
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
 * Types used for services that do instance auto scaling
 ***********************************/
export interface InstanceAutoScalingConfig {
    min_instances: number;
    max_instances: number;
    scaling_policies?: InstanceScalingPolicyConfig[];
}

export interface InstanceScalingPolicyConfig {
    type: InstanceScalingPolicyType;
    adjustment: InstanceScalingPolicyAdjustment;
    alarm: InstanceScalingPolicyAlarm;
}

export interface InstanceScalingPolicyAdjustment {
    type?: string;
    value: number;
    cooldown?: number;
}

export interface InstanceScalingPolicyAlarm {
    namespace?: string;
    dimensions?: InstanceScalingPolicyAlarmDimensions;
    metric_name: string;
    statistic?: string;
    threshold: number;
    comparison_operator: string;
    period?: number;
    evaluation_periods?: number;
}

export interface InstanceScalingPolicyAlarmDimensions {
    [key: string]: string;
}

export enum InstanceScalingPolicyType {
    UP = 'up',
    DOWN = 'down'
}

export interface HandlebarsInstanceScalingPolicy {
    adjustmentType: string;
    adjustmentValue: number;
    cooldown: number;
    statistic: string;
    comparisonOperator: string;
    dimensions: HandlebarsInstanceScalingDimension[] | undefined;
    metricName: string;
    namespace: string;
    period: number;
    evaluationPeriods: number;
    threshold: number;
    scaleUp?: boolean;
    scaleDown?: boolean;
}

export interface HandlebarsInstanceScalingDimension {
    name: string;
    value: string;
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

export interface GlobalOptions {
    debug: boolean;
    linkExtensions: boolean;
}

// tslint:disable-next-line:no-empty-interface
export interface CheckOptions extends GlobalOptions {
}

export interface DeployOptions extends GlobalOptions {
    accountConfig: string;
    environments: string[];
    tags?: Tags;
}

export interface DeleteOptions extends GlobalOptions {
    accountConfig: string;
    environments: string[];
    yes: boolean;
}
