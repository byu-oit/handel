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
import { ServiceConfig, Tags } from 'handel-extension-api';

export interface ElasticsearchConfig extends ServiceConfig {
    version: number;
    instance_type?: string;
    instance_count?: number;
    master_node?: ElasticsearchMasterNode;
    ebs?: ElasticsearchEbs;
    tags?: Tags;
}

export interface ElasticsearchMasterNode {
    instance_type: string;
    instance_count: number;
}

export interface ElasticsearchEbs {
    size_gb: number;
    provisioned_iops?: number;
}

export interface HandlebarsElasticsearchTemplate {
    domainName: string;
    elasticsearchVersion: number;
    tags: Tags;
    subnetId: string;
    securityGroupId: string;
    instanceType: string;
    instanceCount: number;
    dedicatedMasterNode?: HandlebarsDedicatedMasterNode;
    ebs?: HandlebarsEbs;
}

export interface HandlebarsDedicatedMasterNode {
    instanceType: string;
    instanceCount: number;
}

export interface HandlebarsEbs {
    volumeSize: number;
    provisionedIops?: number;
}
