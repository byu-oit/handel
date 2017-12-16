import { BindContext } from './bind-context';
import { ConsumeEventsContext } from './consume-events-context';
import { DeployContext } from './deploy-context';
import { PreDeployContext } from './pre-deploy-context';
import { ProduceEventsContext } from './produce-events-context';
import ServiceConfig from './service-config';
import { ServiceContext } from './service-context';
import { UnBindContext } from './un-bind-context';
import { UnDeployContext } from './un-deploy-context';
import { UnPreDeployContext } from './un-pre-deploy-context';

export enum DeployOutputType {
    environmentVariables, scripts, policies, credentials, securityGroups
}

export interface ServiceDeployer {
    producedEventsSupportedServices: string[];
    producedDeployOutputTypes: DeployOutputType[];
    consumedDeployOutputTypes: DeployOutputType[];
    check?(serviceContext: ServiceContext<ServiceConfig>, dependenciesServiceContexts: Array<ServiceContext<ServiceConfig>>): string[];
    preDeploy?(serviceContext: ServiceContext<ServiceConfig>): Promise<PreDeployContext>;
    bind?(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: PreDeployContext, dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: PreDeployContext): Promise<BindContext>;
    deploy?(ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: PreDeployContext, dependenciesDeployContexts: DeployContext[]): Promise<DeployContext>;
    consumeEvents?(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: DeployContext, producerServiceContext: ServiceContext<ServiceConfig>, producerDeployContext: DeployContext): Promise<ConsumeEventsContext>;
    produceEvents?(ownServiceContext: ServiceContext<ServiceConfig>, ownDeployContext: DeployContext, consumerServiceContext: ServiceContext<ServiceConfig>, consumerDeployContext: DeployContext): Promise<ProduceEventsContext>;
    unPreDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnPreDeployContext>;
    unBind?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnBindContext>;
    unDeploy?(ownServiceContext: ServiceContext<ServiceConfig>): Promise<UnDeployContext>;
}

export interface ServiceDeployers {
    [key: string]: ServiceDeployer;
}

export interface HandelFile {
    version: number;
    name: string;
    environments: HandelFileEnvironments;
}

export interface HandelFileEnvironments {
    [environmentName: string]: HandelFileEnvironment;
}

export interface HandelFileEnvironment {
    [serviceName: string]: ServiceConfig;
}
