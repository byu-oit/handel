"use strict";
/*
 *  @license
 *    Copyright 2018 Brigham Young University
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */
const __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const aws = require("aws-sdk");
const constantCase = require("constant-case");
const handelExtensions = require("handel-extension-api");
const randomstring = require("randomstring");
const log = require("winston");

const VALID_PARAMETER_NAME = /^([a-zA-Z0-9_.\-\/]+)$/;
const SERVICE_NAME = 'Random Secret';
const MAXIMUM_LENGTH = 4096;
const DEFAULT_CHARSET = 'alphanumeric';
const DEFAULT_LENGTH = 32;

class RandomSecretService {
    constructor() {
        this.consumedDeployOutputTypes = [];
        this.producedDeployOutputTypes = [handelExtensions.DeployOutputType.EnvironmentVariables];
        this.producedEventsSupportedTypes = [];
        this.supportsTagging = false;
        this.providedEventType = null;
        this.producedEventsSupportedServices = [];
    }

    check(serviceContext, dependenciesServiceContexts) {
        const { params } = serviceContext;
        const { name, length, charset } = params;
        const errors = [];
        if (name && !VALID_PARAMETER_NAME.test(name)) {
            errors.push('\'name\' parameter can only contain alphanumeric characters, periods (.), dashes (-), and forward slashes (/)');
        }
        if (length && (length < 1 || length > MAXIMUM_LENGTH)) {
            errors.push(`'length' parameter must be between '1' and '${MAXIMUM_LENGTH}'`);
        }
        if (charset && charset.length < 10) {
            errors.push('\'charset\' parameter must include more than 10 characters');
        }
        return errors.map(it => SERVICE_NAME + ' - ' + it);
    }

    deploy(ownServiceContext, ownPreDeployContext, dependenciesDeployContexts) {
        return __awaiter(this, void 0, void 0, function* () {
            const { params, accountConfig, appName, environmentName, serviceName } = ownServiceContext;
            const ssm = new aws.SSM({ region: accountConfig.region });
            const name = params.name || `${appName}.${environmentName}.${serviceName}`;
            if (yield parameterExists(ssm, name)) {
                log.info(SERVICE_NAME + ' - Parameter already exists. Skipping deployment.');
                return getDeployContext(ownServiceContext, name);
            }
            const value = generateValue(params.charset || DEFAULT_CHARSET, params.length || DEFAULT_LENGTH);
            yield createParameter(ssm, name, value);
            return getDeployContext(ownServiceContext, name);
        });
    }

    unDeploy(ownServiceContext) {
        return __awaiter(this, void 0, void 0, function* () {
            const { params, accountConfig, appName, environmentName, serviceName } = ownServiceContext;
            const ssm = new aws.SSM({ region: accountConfig.region });
            const name = params.name || `${appName}.${environmentName}.${serviceName}`;
            if (yield parameterExists(ssm, name)) {
                yield deleteParameter(ssm, name);
            }
            return new handelExtensions.UnDeployContext(ownServiceContext);
        });
    }
}

exports.RandomSecretService = RandomSecretService;

function deleteParameter(ssm, name) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ssm.deleteParameter({
            Name: name
        }).promise();
    });
}

function createParameter(ssm, name, value) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ssm.putParameter({
            Name: name,
            Value: value,
            Type: 'SecureString'
        }).promise();
    });
}

function getDeployContext(context, name) {
    const result = new handelExtensions.DeployContext(context);
    result.addEnvironmentVariables({
        [constantCase(context.serviceName + '_parameter_name')]: name
    });
    result.policies = getIamPoliciesFor(context, name);
    return result;
}

function getIamPoliciesFor(context, name) {
    const { accountConfig } = context;
    return [
        {
            'Effect': 'Allow',
            'Action': [
                'ssm:GetParameter*'
            ],
            'Resource': [
                `arn:aws:ssm:${accountConfig.region}:${accountConfig.account_id}:parameter/${name}`
            ]
        }
    ];
}

function parameterExists(ssm, name) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield ssm.describeParameters({
            Filters: [{
                    Key: 'Name',
                    Values: [name]
                }]
        }).promise();
        return !!response.Parameters && response.Parameters.length > 0;
    });
}

function generateValue(charset, length) {
    return randomstring.generate({
        length: length,
        charset: charset
    });
}
