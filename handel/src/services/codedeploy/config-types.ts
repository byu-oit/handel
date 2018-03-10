import { EnvironmentVariables, ServiceConfig, Tags } from '../../datatypes';

export interface CodeDeployServiceConfig extends ServiceConfig {
    path_to_code: string;
    instance_type?: string;
    auto_scaling: CodeDeployAutoScalingConfig;
    key_name?: string;
    environment_variables?: EnvironmentVariables;
    tags?: Tags;
}

export interface CodeDeployAutoScalingConfig {
    min_instances: number;
    max_instances: number;
}

export interface HandlebarsCodeDeployTemplate {
    appName: string;
    policyStatements: any[];
    amiImageId: string;
    instanceType: string;
    securityGroupId: string;
    userData: string;
    asgCooldown: string;
    minInstances: number;
    maxInstances: number;
    tags: Tags;
    privateSubnetIds: string[];
    s3BucketName: string;
    s3KeyName: string;
    deploymentConfigName: string;
    serviceRoleArn: string;
    sshKeyName?: string;
}
