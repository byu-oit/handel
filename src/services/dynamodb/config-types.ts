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
import ServiceConfig from '../../datatypes/service-config';
import {ServiceContext} from '../../datatypes/service-context';
import Tags from '../../datatypes/tags';

export type DynamoDBContext = ServiceContext<DynamoDBConfig>;

export interface DynamoDBConfig extends ServiceConfig {
    partition_key: KeyDefinition;
    sort_key?: KeyDefinition;
    provisioned_throughput?: ProvisionedThroughput;
    stream_view_type?: StreamViewType;
    local_index_config?: LocalIndexConfig[];
    global_indexes?: GlobalIndexConfig[];
    tags?: Tags;
}

export declare enum StreamViewType {
    KEYS_ONLY = 'KEYS_ONLY',
    NEW_IMAGE = 'NEW_IMAGE',
    OLD_IMAGE = 'OLD_IMAGE',
    NEW_AND_OLD_IMAGES = 'NEW_AND_OLD_IMAGES'
}

export interface ProvisionedThroughput {
    read_capacity_units?: string | number;
    read_target_utilization?: number;
    write_capacity_units?: string | number;
    write_target_utilization?: number;
}

export interface LocalIndexConfig {
    name: string;
    sort_key: KeyDefinition;
    attributes_to_copy: string[];
}

export interface GlobalIndexConfig {
    name: string;
    partition_key: KeyDefinition;
    sort_key?: KeyDefinition;
    attributes_to_copy: string[];
    provisioned_throughput?: ProvisionedThroughput;
}

export interface KeyDefinition {
    name: string;
    type: KeyDataType;
}

export declare enum KeyDataType {
    String = 'String', Number = 'Number'
}
