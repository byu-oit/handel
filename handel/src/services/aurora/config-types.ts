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
    stackName: string;
    dbSubnetGroup: string;
    engine: string;
    engineVersion: string;
    port: number;
    dbSecurityGroupId: string;
    instances: HandlebarsInstanceConfig[];
    clusterParameters?: HandlebarsAuroraParameterGroupParams;
    instanceParameters?: HandlebarsAuroraParameterGroupParams;
}

export interface HandlebarsAuroraParameterGroupParams {
    [key: string]: string;
}

export interface HandlebarsInstanceConfig {
    instanceType: string;
}
