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
import { ServiceConfig, Tags } from '../../datatypes/index';

export interface RedisServiceConfig extends ServiceConfig {
    instance_type: string;
    redis_version: string;
    description?: string;
    maintenance_window?: string;
    read_replicas?: number;
    snapshot_window?: string;
    cache_parameters?: RedisCacheParameters;
}

export interface RedisCacheParameters {
    [key: string]: string;
}

export interface HandlebarsRedisTemplate {
    description: string;
    instanceType: string;
    cacheSubnetGroup: string;
    redisVersion: string;
    stackName: string;
    clusterName: string;
    maintenanceWindow: string | undefined;
    redisSecurityGroupId: string;
    snapshotWindow: string | undefined;
    numNodes: number;
    tags: Tags;
    cacheParameters?: RedisCacheParameters;
    cacheParameterGroupFamily?: string;
    defaultCacheParameterGroup?: string;
}