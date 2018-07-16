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
import { ServiceContext } from 'handel-extension-api';
import * as route53Calls from '../../aws/route53-calls';
import { CodeDeployServiceConfig, HandlebarsCodeDeployRoutingConfig } from './config-types';

export async function getRoutingConfig(stackName: string, ownServiceContext: ServiceContext<CodeDeployServiceConfig>): Promise<HandlebarsCodeDeployRoutingConfig | undefined> {
    const params = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;
    if(params.routing) {
        const routingConfig: HandlebarsCodeDeployRoutingConfig = {
            albName: stackName.substring(0, 32).replace(/-$/, ''), // Configure the shortened ALB name (it has a limit of 32 chars)
            basePath: params.routing.base_path ? params.routing.base_path : '/',
            healthCheckPath: params.routing.health_check_path ? params.routing.health_check_path : '/'
        };
        if(params.routing.type === 'https') {
            routingConfig.httpsCertificate = `arn:aws:acm:${accountConfig.region}:${accountConfig.account_id}:certificate/${params.routing.https_certificate}`;
        }
        if(params.routing.dns_names) { // Add DNS names if specified
            const hostedZones = await route53Calls.listHostedZones();
            routingConfig.dnsNames = params.routing.dns_names.map(name => {
                const zone = route53Calls.requireBestMatchingHostedZone(name, hostedZones);
                return {
                    name: name,
                    zoneId: zone.Id
                };
            });
        }
        return routingConfig;
    }
}
