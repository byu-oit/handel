import { BindContext, IPreDeployContext, ServiceConfig, ServiceContext } from 'handel-extension-api';
import * as ec2Calls from '../aws/ec2-calls';

export async function bindDependentSecurityGroup(
    ownServiceContext: ServiceContext<ServiceConfig>, ownPreDeployContext: IPreDeployContext,
    dependentOfServiceContext: ServiceContext<ServiceConfig>, dependentOfPreDeployContext: IPreDeployContext, protocol: string,
    ports: number | number[]
) {
    const ownSg = ownPreDeployContext.securityGroups[0];
    const sourceSg = dependentOfPreDeployContext.securityGroups[0];
    let portsToBind: number[];
    if(ports instanceof Array) {
        portsToBind = ports;
    } else {
        portsToBind = [ports];
    }
    for (const portToBind of portsToBind) {
        await ec2Calls.addIngressRuleToSgIfNotExists(sourceSg, ownSg, protocol, portToBind, portToBind, ownServiceContext.accountConfig.vpc);
    }
    return new BindContext(ownServiceContext, dependentOfServiceContext);
}
