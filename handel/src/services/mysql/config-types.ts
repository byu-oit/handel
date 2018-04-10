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

export interface MySQLConfig extends ServiceConfig {
    mysql_version: string;
    database_name: string;
    description?: string;
    instance_type?: string;
    storage_gb?: number;
    storage_type?: MySQLStorageType;
    db_parameters?: MySQLDbParameters;
    multi_az?: boolean;
    tags?: Tags;
}

export enum MySQLStorageType {
    STANDARD = 'standard',
    GP2 = 'gp2'
}

export interface MySQLDbParameters {
    [key: string]: string;
}

export interface HandlebarsMySqlTemplate {
    description: string;
    storageGB: number;
    instanceType: string;
    stackName: string;
    databaseName: string;
    dbSubnetGroup: string;
    mysqlVersion: string;
    dbPort: number;
    storageType: MySQLStorageType;
    dbSecurityGroupId: string;
    parameterGroupFamily: string;
    tags: Tags;
    parameterGroupParams?: MySQLDbParameters;
    multi_az?: boolean;
}
