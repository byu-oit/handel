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
import { DeployContext, EnvironmentVariables, PreDeployContext, ServiceContext } from 'handel-extension-api';
import { awsCalls, deployPhase } from 'handel-extension-support';
import * as _ from 'lodash';
import * as route53 from '../../aws/route53-calls';
import * as util from '../../common/util';
import {APIGatewayConfig, CustomDomain} from './config-types';

export function getSecurityGroups(ownPreDeployContext: PreDeployContext): string[] {
    const securityGroups: string[] = [];
    if (ownPreDeployContext.securityGroups) {
        ownPreDeployContext.securityGroups.forEach((secGroup) => {
            securityGroups.push(secGroup.GroupId!);
        });
    }
    return securityGroups;
}

export function getRestApiUrl(cfStack: AWS.CloudFormation.Stack, serviceContext: ServiceContext<APIGatewayConfig>) {
    const restApiId = awsCalls.cloudFormation.getOutput('RestApiId', cfStack);
    const restApiDomain = `${restApiId}.execute-api.${serviceContext.accountConfig.region}.amazonaws.com`;
    const stageName = serviceContext.environmentName; // Env name is the stage name
    return `https://${restApiDomain}/${stageName}/`;
}

export function getPolicyStatementsForLambdaRole(serviceContext: ServiceContext<APIGatewayConfig>, dependenciesDeployContexts: DeployContext[]) {
    let ownPolicyStatements;
    if (serviceContext.params.vpc) {
        ownPolicyStatements = JSON.parse(util.readFileSync(`${__dirname}/lambda-role-statements-vpc.json`));
    } else {
        ownPolicyStatements = JSON.parse(util.readFileSync(`${__dirname}/lambda-role-statements.json`));
    }

    return deployPhase.getAllPolicyStatementsForServiceRole(serviceContext, ownPolicyStatements, dependenciesDeployContexts, true);
}

export async function getCustomDomainHandlebarsParams(serviceContext: ServiceContext<any>, customDomains?: CustomDomain[]): Promise<any[]> {
    if (!customDomains) {
      return [];
    }
    const zones = await route53.listHostedZones();
    return customDomains.map(domain => {
        const {dns_name, https_certificate} = domain;
        const hostedZone = route53.getBestMatchingHostedZone(dns_name, zones);
        if (!hostedZone) {
            throw new Error(`There is no Route53 hosted zone in this account that matches '${dns_name}'`);
        }

        let cert: string;
        if (https_certificate.indexOf('arn:') === 0) {
            cert = https_certificate;
        } else {
            cert = `arn:aws:acm:us-east-1:${serviceContext.accountConfig.account_id}:certificate/${https_certificate}`;
        }

        return {
            name: dns_name,
            zoneId: hostedZone.Id,
            certificateArn: cert
        };
    });
}
