import { BindContext, IPreDeployContext, ServiceConfig, ServiceContext } from 'handel-extension-api';
import * as ec2Calls from '../aws/ec2-calls';

export async function bindDependentSecurityGroup(
    ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: IPreDeployContext,
    dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: IPreDeployContext, protocol: string,
    port: number
) {
    const ownSg = ownPreDeployContext.securityGroups[0];
    const sourceSg = dependentOfPreDeployContext.securityGroups[0];
    await ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg, protocol, port, port, ownServiceContext.accountConfig.vpc);
    return new BindContext(ownServiceContext, dependentOfServiceContext);
}
