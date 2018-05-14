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
import { EnvironmentVariables, ServiceConfig, ServiceEventConsumer, Tags } from 'handel-extension-api';

export interface LambdaServiceConfig extends ServiceConfig {
    path_to_code: string;
    handler: string;
    runtime: string;
    description?: string;
    memory?: number;
    timeout?: number;
    vpc?: boolean;
    environment_variables?: EnvironmentVariables;
}

export interface HandlebarsLambdaTemplate {
    description: string;
    functionName: string;
    s3ArtifactBucket: string;
    s3ArtifactKey: string;
    handler: string;
    runtime: string;
    memorySize: number;
    timeout: number;
    policyStatements: any[];
    tags: Tags;
    environmentVariables?: EnvironmentVariables;
    vpc?: boolean;
    vpcSecurityGroupIds?: string[];
    vpcSubnetIds?: string[];
}

export interface DynamoDBLambdaConsumer extends ServiceEventConsumer {
    batch_size: number;
}
