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

import { stripIndent } from 'common-tags';
import * as api from 'handel-extension-api';
import { documentationUrl } from '../common/util';

/*******************************************************************************************************************
 * A number of these types are just aliases or extensions of the types in the instance API. This allows us to keep
 * our types compatible while adding any internal extras we may need.
 ******************************************************************************************************************/

// tslint:disable:no-empty-interface

/************************************
 * Types for the HandelFileParser contract
 ************************************/
export interface HandelFileParser {
    validateHandelFile(handelFile: HandelFile, serviceRegistry: api.ServiceRegistry): Promise<string[]>;

    listExtensions(handelFile: HandelFile): Promise<ExtensionList>;

    createEnvironmentContext(handelFile: HandelFile, environmentName: string, accountConfig: api.AccountConfig, serviceRegistry: api.ServiceRegistry, options: HandelCoreOptions): EnvironmentContext;
}

/***********************************
 * Types for the Handel File
 ***********************************/
export interface HandelFile {
    version: number;
    name: string;
    tags?: api.Tags;
    extensions?: HandelFileExtensions;
    environments: HandelFileEnvironments;
}

export interface HandelFileEnvironments {
    [environmentName: string]: HandelFileEnvironment;
}

export interface HandelFileEnvironment {
    [serviceName: string]: api.ServiceConfig;
}

export interface HandelFileExtensions {
    [extensionPrefix: string]: HandelFileExtension;
}

export type HandelFileExtension = string;

/***********************************
 * Types for the Environment Deployer framework and lifecycle
 ***********************************/
export class EnvironmentContext {
    public serviceContexts: ServiceContexts;

    constructor(public appName: string,
                public environmentName: string,
                public accountConfig: api.AccountConfig,
                public options: HandelCoreOptions = {linkExtensions: false},
                public tags: api.Tags = {}) {
        this.serviceContexts = {};
    }
}

export interface EnvironmentResult {
    environmentName: string;
    deploymentStartTime: number;
    status: string;
    message: string;
    error?: Error;
}

export class EnvironmentDeleteResult implements EnvironmentResult {
    public environmentName: string;
    public deploymentStartTime: number;
    public status: string;
    public message: string;
    public error: Error | undefined;

    constructor(environmentName: string,
                deploymentStartTime: number,
                status: string,
                message: string,
                error?: Error) {
        this.environmentName = environmentName;
        this.deploymentStartTime = deploymentStartTime;
        this.status = status;
        this.message = message;
        this.error = error;
    }
}

export class EnvironmentDeployResult implements EnvironmentResult {
    public environmentName: string;
    public deploymentStartTime: number;
    public status: string;
    public message: string;
    public error: Error | undefined;

    constructor(environmentName: string,
                deploymentStartTime: number,
                status: string,
                message: string,
                error?: Error) {
        this.environmentName = environmentName;
        this.deploymentStartTime = deploymentStartTime;
        this.status = status;
        this.message = message;
        this.error = error;
    }
}

export interface EnvironmentsCheckResults {
    [environmentName: string]: string[];
}

export interface ServiceContexts {
    [serviceName: string]: api.ServiceContext<api.ServiceConfig>;
}

export interface PreDeployContexts {
    [serviceName: string]: api.IPreDeployContext;
}

export interface BindContexts {
    [bindContextName: string]: api.IBindContext;
}

export interface DeployContexts {
    [serviceName: string]: api.IDeployContext;
}

export interface ConsumeEventsContexts {
    [serviceName: string]: api.IConsumeEventsContext;
}

export interface ProduceEventsContexts {
    [serviceName: string]: api.IProduceEventsContext;
}

export interface UnBindContexts {
    [serviceName: string]: api.IUnBindContext;
}

export interface UnDeployContexts {
    [serviceName: string]: api.IUnDeployContext;
}

export interface UnPreDeployContexts {
    [serviceName: string]: api.IUnPreDeployContext;
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
 * Extension-related Types
 ***********************************/

export interface LoadedExtension {
    prefix: string;
    name: string;
    instance: api.Extension;
}

export interface ExtensionDefinition {
    source: ExtensionSource;
    prefix: string;
    spec: string;
}

export enum ExtensionSource {
    NPM = 'npm', FILE = 'file', SCM = 'scm', GIT = 'git'
}

export interface NpmExtensionDefinition extends ExtensionDefinition {
    source: ExtensionSource.NPM;
    name: string;
    versionSpec: string;
}

export function isNpmExtension(defn: ExtensionDefinition): defn is NpmExtensionDefinition {
    return defn.source === ExtensionSource.NPM;
}

export function isFileExtension(defn: ExtensionDefinition): defn is FileExtensionDefinition {
    return defn.source === ExtensionSource.FILE;
}

export function isGitExtension(defn: ExtensionDefinition): defn is GitExtensionDefinition {
    return defn.source === ExtensionSource.GIT;
}

export function isScmExtension(defn: ExtensionDefinition): defn is ScmExtensionDefinition {
    return defn.source === ExtensionSource.SCM;
}

export interface FileExtensionDefinition extends ExtensionDefinition {
    source: ExtensionSource.FILE;
    path: string;
}

export interface ScmExtensionDefinition extends ExtensionDefinition {
    source: ExtensionSource.SCM;
    provider: ScmProvider;
    owner: string;
    repo: string;
    commitish?: string;
}

export enum ScmProvider {
    GITHUB = 'github',
    GITLAB = 'gitlab',
    BITBUCKET = 'bitbucket'
}

export const allScmProviders = [ScmProvider.GITHUB, ScmProvider.GITLAB, ScmProvider.BITBUCKET];

export interface GitExtensionDefinition extends ExtensionDefinition {
    source: ExtensionSource.GIT;
    url: string;
}

export class ExtensionLoadingError extends Error {
    constructor(public readonly name: string, cause: Error) {
        super(stripIndent`
        Error loading extension ${name}: ${cause.message}

        !!! THIS IS MOST LIKELY A PROBLEM WITH THE EXTENSION, NOT WITH HANDEL !!!

        Please check that the extension name and version are correct in your handel.yml.
        If problems persist, contact the maintainer of the extension.

        To help debug, here's the full stack trace of the error:
        ` + '\n' + cause.stack);
    }
}

export class DontBlameHandelError extends Error {
    constructor(message: string, serviceType?: api.ServiceType) {
        super(stripIndent`
        ${message}

        !!! THIS IS MOST LIKELY A PROBLEM AN EXTENSION, NOT WITH HANDEL !!!
        ${!serviceType ? '' : `The error was caused by the '${serviceType.name}' service in extension '${serviceType.prefix}'`}
        `);
    }
}

export class InvalidExtensionSpecificationError extends Error {
    constructor(public readonly spec: string, message: string) {
        super(stripIndent`
        Invalid extension specification: ${spec}.
        ${message}

        Please correct your handel.yml file and try again.
        `);
    }
}

export type ExtensionList = ExtensionDefinition[];

export class MissingPrefixError extends Error {
    constructor(public readonly prefix: string) {
        super(stripIndent`
        Unregistered Prefix: '${prefix}'.

        Make sure you have an extension registered with this prefix in your handel.yml:

          extensions:
            ${prefix}: {handel extension package name}

        For more info, visit ${documentationUrl('handel-basics/extensions.html')}
        `);
    }
}

export class MissingDeployerError extends Error {
    constructor(
        public readonly name: string,
        public readonly extension: string) {
        super(stripIndent`
            Missing Service: '${name}' in extension '${extension}'

            Check your handel.yml to make sure that you haven't misspelled the service name.
            Check the documentation for ${extension} to ensure it supports the service you are trying to use.
        `);
    }
}

export class ExtensionInstallationError extends Error {
    constructor(
        public readonly extensions: ExtensionList,
        public readonly output: string
    ) {
        super(stripIndent`
            Error installing Handel extensions

            The following extensions were requested to be installed:
             - ${extensions.map(e => e.spec).join('\n - ')}

            Check your handel.yml to make sure that you haven't misspelled the extension name and that
            the version range (if specified) is valid (https://docs.npmjs.com/misc/semver#ranges).

            To help debug, here's the error output from the installation:

            ---------------
        ` + '\n\n' + output + '\n\n---------------');
    }
}

/***********************************
 * Other Types
 ***********************************/
export interface HandelCoreOptions {
    linkExtensions: boolean;
}

// tslint:disable-next-line:no-empty-interface
export interface CheckOptions extends HandelCoreOptions {
}

export interface DeployOptions extends HandelCoreOptions {
    accountConfig: string;
    environments: string[];
    tags?: api.Tags;
}

export interface DeleteOptions extends HandelCoreOptions {
    accountConfig: string;
    environment: string;
    yes: boolean;
}
