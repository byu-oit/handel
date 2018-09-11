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
import * as Ajv from 'ajv';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import { AccountConfig } from 'handel-extension-api';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as winston from 'winston';
import * as ec2Calls from '../aws/ec2-calls';
import * as util from '../common/util';
import * as defaultAccountConfig from './default-account-config';

// function throwValidateError(field: string) {
//     throw new Error(`'${field}' field missing in the account config file`);
// }

// TODO - We should turn this into a json schema validation
export function validateJsonSchema(schemaPath: string, accountConfig: AccountConfig) {
    const ajv = new Ajv({allErrors: true, jsonPointers: true});
    require('ajv-errors')(ajv);
    let schema;
    try {
        schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    }
    catch (e) {
        return [`Couldn't read schema file to check the service schema`];
    }
    const valid = ajv.validate(schema, accountConfig);
    if (!valid) {
        return ajv.errors!.map(error => error.message!);
    }
    else {
        return [];
    }
}

function validateAccountConfig(configToValidate: any) {
    const errors: string[] = validateJsonSchema(`${__dirname}/params-schema.json`, configToValidate);
    return errors.map(error => `Account Config - ${error}`);
}

function getAbsoluteConfigFilePath(filePath: string): string {
    let absolutePath: string = '';
    if (fs.existsSync(filePath)) {
        absolutePath = path.resolve(filePath);
    }
    if (!absolutePath) {
        winston.error(`Invalid file path for config file: ${filePath}`);
        process.exit(1);
    }
    return absolutePath;
}

function configureAwsSdk(region: string): void {
    process.env.AWS_REGION = region;
    AWS.config.update({
        maxRetries: 10
    });
}

/**
 * Given an account config file path or base64 encoded string, loads the account config
 */
export default async function(accountConfigParam: string): Promise<AccountConfig> {
    let accountConfig;
    if (accountConfigParam.startsWith('default')) {
        const region = accountConfigParam.substring(accountConfigParam.indexOf('-') + 1);
        configureAwsSdk(region); // Set up AWS to use our chosen region
        accountConfig = await defaultAccountConfig.getDefaultAccountConfig(region);
    }
    else if (fs.existsSync(accountConfigParam)) {
        const absoluteConfigFilePath = getAbsoluteConfigFilePath(accountConfigParam);
        accountConfig = util.readYamlFileSync(absoluteConfigFilePath);
        configureAwsSdk(accountConfig.region); // Set up AWS to use our chosen region
        validateAccountConfig(accountConfig);
    }
    else {
        accountConfig = yaml.safeLoad(new Buffer(accountConfigParam, 'base64').toString()) as AccountConfig;
        configureAwsSdk(accountConfig.region); // Set up AWS to use our chosen region
        validateAccountConfig(accountConfig);
    }
    return accountConfig;
}
