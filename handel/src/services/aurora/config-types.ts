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
    ServiceConfig,
    Tags
} from 'handel-extension-api';

export interface AuroraConfig extends ServiceConfig {
    engine: AuroraEngine;
    version: string;
    database_name: string;
    instance_type?: string;
    cluster_size?: number;
    description?: string;
    cluster_parameters?: AuroraDBParameters;
    instance_parameters?: AuroraDBParameters;
}

export interface AuroraDBParameters {
    [parameterName: string]: string;
}

export enum AuroraEngine {
    mysql = 'mysql',
    postgresql = 'postgresql'
}

export interface HandlebarsAuroraTemplate {
    description: string;
    parameterGroupFamily: string;
    tags: Tags;
    databaseName: string;
    dbName: string;
    dbSubnetGroup: string;
    engine: string;
    engineVersion: string;
    port: number;
    dbSecurityGroupId: string;
    instances: HandlebarsInstanceConfig[];
    isMySQL: boolean;
    clusterParameters?: HandlebarsAuroraParameterGroupParams;
    instanceParameters?: HandlebarsAuroraParameterGroupParams;
}

export interface HandlebarsAuroraParameterGroupParams {
    [key: string]: string;
}

export interface HandlebarsInstanceConfig {
    instanceType: string;
}
