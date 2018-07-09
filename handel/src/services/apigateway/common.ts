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
import { DeployContext, PreDeployContext, ServiceContext } from 'handel-extension-api';
import { awsCalls, deployPhase } from 'handel-extension-support';
import { parse as parseQuery } from 'querystring';
import * as  uuid from 'uuid';
import * as winston from 'winston';
import * as lambdaCalls from '../../aws/lambda-calls';
import * as route53 from '../../aws/route53-calls';
import * as util from '../../common/util';
import { APIGatewayConfig, CustomDomain, WarmupConfig } from './config-types';

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
        const hostedZone = route53.requireBestMatchingHostedZone(dns_name, zones);

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

const WARMUP_SCHEDULE_RATE_PATTERN = /^rate\(.*\)$/;
const WARMUP_SCHEDULE_CRON_PATTERN = /^cron\(.*\)$/;
const WARMUP_SCHEDULE_PATTERNS = [WARMUP_SCHEDULE_CRON_PATTERN, WARMUP_SCHEDULE_RATE_PATTERN];

export function checkWarmupConfig(warmup: WarmupConfig): string[] {
    const errors = [];
    if (!warmup.schedule) {
        errors.push(`'warmup' is missing the 'schedule' parameter.`);
    } else if (!WARMUP_SCHEDULE_PATTERNS.find(it => it.test(warmup.schedule))) {
        errors.push(`Invalid warmup schedule expression: ${warmup.schedule}. Must be a rate or cron expression.`);
    }

    if (warmup.http_paths) {
        if (!Array.isArray(warmup.http_paths)) {
            errors.push(`'warmup.http_paths' must be an array`);
        } else if (warmup.http_paths.length > 5) {
            errors.push(`A maximum of 5 values may be specified for 'warmup.http_paths'`);
        }
    }
    return errors;
}

export function getWarmupTemplateParameters(warmupConf: WarmupConfig, serviceContext: ServiceContext<APIGatewayConfig>, restApiLogicalId: string) {
    const result: any = {
        schedule: warmupConf.schedule
    };

    if (warmupConf.http_paths) {
        result.httpPaths = warmupConf.http_paths.map(it => {
            const event = createApiGatewayProxyEventBody(
                it,
                `$\{${restApiLogicalId}}`,
                serviceContext.environmentName,
                serviceContext
            );
            return {
                path: it,
                eventBody: JSON.stringify(JSON.stringify(event))// Double-encoding for YAML
            };
        });
    }
    return result;
}

export async function preWarmLambda(
    serviceContext: ServiceContext<APIGatewayConfig>,
    warmupConfig: WarmupConfig,
    lambdaArn: string,
    restApiId: string
): Promise<void> {
    winston.debug(`${serviceContext.serviceName} - Pre-warming lambda ${lambdaArn}`);

    let events: any[];
    if (warmupConfig.http_paths) {
        events = warmupConfig.http_paths.map(it => {
            return createApiGatewayProxyEventBody(it, restApiId, serviceContext.environmentName, serviceContext);
        });
    } else {
        events = [createCloudwatchScheduledEventBody(serviceContext)];
    }
    for (const event of events) {
        await lambdaCalls.invokeLambda(lambdaArn, event);
    }
}

export function createCloudwatchScheduledEventBody(context: ServiceContext<APIGatewayConfig>): any {
    return {
        version: '0',
        id: uuid(),
        'detail-type': 'Scheduled Event',
        source: 'aws.events',
        account: context.accountConfig.account_id,
        time: new Date().toISOString(),
        region: context.accountConfig.region,
        resources: [
            'handel-warmup'
        ],
        detail: {}
    };
}

export function createApiGatewayProxyEventBody(path: string, apiId: string, stageName: string, serviceContext: ServiceContext<APIGatewayConfig>): any {
    let proxyPath = path.startsWith('/') ? path.substring(1) : path;
    let queryString = '';
    if (proxyPath.includes('?')) {
        [proxyPath, queryString] = proxyPath.split('?', 2);
    }

    const queryParams = queryString ? parseQuery(queryString) : null;

    return {
        resource: '/{proxy+}',
        path: '/' + proxyPath,
        httpMethod: 'GET',
        headers: {
            'Accept': '*/*',
            'Cache-Control': 'no-cache',
            'Host': `${apiId}.execute-api.${serviceContext.accountConfig.region}.amazonaws.com`,
            'User-Agent': 'Handel-Warmup/0.0.0',
            'X-Lambda-Warmup': path,
        },
        queryStringParameters: queryParams,
        pathParameters: {
            proxy: proxyPath,
        },
        stageVariables: null,
        requestContext: {
            accountId: serviceContext.accountConfig.account_id,
            resourceId: 'warmup',
            stage: stageName,
            requestId: 'warmup',
            identity: {
                cognitoIdentityPoolId: null,
                accountId: null,
                cognitoIdentityId: null,
                caller: null,
                apiKey: null,
                sourceIp: '192.168.196.186',
                cognitoAuthenticationType: null,
                cognitoAuthenticationProvider: null,
                userArn: null,
                userAgent: 'Handel-Warmup/0.0.0',
                user: null,
            },
            resourcePath: '/{proxy+}',
            httpMethod: 'GET',
            apiId
        },
        body: null,
        isBase64Encoded: false,
    };
}
