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
import { ServiceConfig, Tags } from '../../datatypes/index';

export interface MemcachedServiceConfig extends ServiceConfig {
    instance_type: string;
    memcached_version: string;
    description?: string;
    node_count?: number;
    cache_parameters?: MemcachedCacheParameters;
}

export interface MemcachedCacheParameters {
    [key: string]: string;
}

export interface HandlebarsMemcachedTemplate {
    description: string;
    instanceType: string;
    cacheSubnetGroup: string;
    memcachedVersion: string;
    stackName: string;
    clusterName: string;
    memcachedSecurityGroupId: string;
    nodeCount: number;
    memcachedPort: number;
    tags: Tags;
    cacheParameters?: MemcachedCacheParameters;
    cacheParameterGroupFamily?: string;
    defaultCacheParameterGroup?: string;
}
