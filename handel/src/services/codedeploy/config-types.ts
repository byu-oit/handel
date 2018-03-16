import { EnvironmentVariables, ServiceConfig, Tags } from '../../datatypes';

export interface CodeDeployServiceConfig extends ServiceConfig {
    path_to_code: string;
    instance_type?: string;
    key_name?: string;
    os?: string;
    deployment?: CodeDeployDeploymentConfig;
    auto_scaling?: CodeDeployAutoScalingConfig;
    routing?: CodeDeployRoutingConfig;
    environment_variables?: EnvironmentVariables;
    tags?: Tags;
}

export interface CodeDeployDeploymentConfig {
    style: string;
    config: string;
}

export interface CodeDeployAutoScalingConfig {
    min_instances: number;
    max_instances: number;
}

export interface CodeDeployRoutingConfig {
    type: string;
    https_certificate?: string;
    base_path?: string;
    health_check_path?: string;
    dns_names: string[];
}

export interface HandlebarsCodeDeployTemplate {
    appName: string;
    policyStatements: any[];
    amiImageId: string;
    instanceType: string;
    securityGroupId: string;
    userData: string;
    autoScaling: HandlebarsCodeDeployAutoScalingConfig;
    routing?: HandlebarsCodeDeployRoutingConfig;
    tags: Tags;
    privateSubnetIds: string[];
    publicSubnetIds: string[];
    vpcId: string;
    s3BucketName: string;
    s3KeyName: string;
    deploymentConfigName: string;
    serviceRoleArn: string;
    sshKeyName?: string;
    assignPublicIp: boolean;
}

export interface HandlebarsCodeDeployAutoScalingConfig {
    minInstances: number;
    maxInstances: number;
    cooldown: string;
}

export interface HandlebarsCodeDeployRoutingConfig {
    albName: string;
    httpsCertificate?: string;
    basePath: string;
    healthCheckPath: string;
    dnsNames?: HandlebarsCodeDeployDnsNamesConfig[];
}

export interface HandlebarsCodeDeployDnsNamesConfig {
    name: string;
    zoneId: string;
}
