import {
    ServiceConfig,
    Tags
} from 'handel-extension-api';

export interface AuroraConfig extends ServiceConfig {
    engine: AuroraEngine;
    version: string;
    database_name: string;
    description?: string;
    primary: AuroraPrimaryConfig;
    read_replicas?: AuroraReadReplicaConfig[];
    db_parameters?: AuroraDBParameters;
}

export interface AuroraDBParameters {
    [parameterName: string]: string;
}

export enum AuroraEngine {
    mysql = 'mysql',
    postgresql = 'postgresql'
}

export interface AuroraPrimaryConfig {
    instance_type: string;
    storage_type?: string;
}

export interface AuroraReadReplicaConfig {
    instance_type: string;
    storage_type?: string;
}

export interface HandlebarsAuroraTemplate {
    description: string;
    parameterGroupFamily: string;
    parameterGroupParams: HandlebarsAuroraParameterGroupParams;
    tags: Tags;
    databaseName: string;
    stackName: string;
    dbSubnetGroup: string;
    engine: string;
    engineVersion: string;
    port: number;
    dbSecurityGroupId: string;
    primary: HandlebarsAuroraPrimary;
    readReplicas?: HandlebarsAuroraReadReplica[];
}

export interface HandlebarsAuroraParameterGroupParams {
    [key: string]: string;
}

export interface HandlebarsAuroraPrimary {
    instanceType: string;
    storageType: string;
}

export interface HandlebarsAuroraReadReplica {
    instanceType: string;
    storageType: string;
}
