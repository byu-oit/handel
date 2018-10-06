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

export interface AuroraServerlessConfig extends ServiceConfig {
    engine: AuroraServerlessEngine;
    version: string;
    database_name: string;
    description?: string;
    scaling?: AuroraServerlessScalingConfig;
    cluster_parameters?: AuroraServerlessDBParameters;
}

export interface AuroraServerlessScalingConfig {
    auto_pause?: boolean;
    seconds_until_auto_pause?: number;
    min_capacity: AuroraServerlessCapacity;
    max_capacity: AuroraServerlessCapacity;
}

export type AuroraServerlessCapacity = 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256;

export interface AuroraServerlessDBParameters {
    [parameterName: string]: string;
}

export enum AuroraServerlessEngine {
    mysql = 'mysql'
}

export interface HandlebarsAuroraServerlessTemplate {
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
    clusterParameters?: HandlebarsAuroraServerlessParameterGroupParams;
    scaling?: HandlebarsAuroraServerlessScalingTemplate;
}

export interface HandlebarsAuroraServerlessScalingTemplate {
    autoPause: boolean;
    secondsUntilAutoPause: number;
    minCapacity: AuroraServerlessCapacity;
    maxCapacity: AuroraServerlessCapacity;
}

export interface HandlebarsAuroraServerlessParameterGroupParams {
    [key: string]: string;
}
