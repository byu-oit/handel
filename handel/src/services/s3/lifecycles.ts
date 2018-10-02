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
import { HandlebarsS3LifecycleConfig, HandlebarsS3LifecycleTransition, HandlebarsS3LifecycleTransitionExpiration, S3LifecycleTransition, S3ServiceConfig } from './config-types';

function getExpiration(transitions: S3LifecycleTransition[]): HandlebarsS3LifecycleTransitionExpiration {
    const expiration: HandlebarsS3LifecycleTransitionExpiration = {};
    for (const transition of transitions) {
        if (transition.type === 'expiration') {
            expiration.type = transition.days ? 'days' : 'date';
            expiration.value = expiration.type === 'days' ? transition.days : transition.date;
        }
    }
    return expiration;
}

function getTransitions(transitions: S3LifecycleTransition[]): HandlebarsS3LifecycleTransition[] {
    const parsedTransitions = [];
    for (const transition of transitions) {
        const transitionConfig: HandlebarsS3LifecycleTransition = {};
        switch (transition.type) {
            case 'ia':
                transitionConfig.type = 'STANDARD_IA';
                break;
            case 'glacier':
                transitionConfig.type = 'GLACIER';
                break;
            default:
                continue;
        }
        transitionConfig.days = transition.days;
        transitionConfig.date = transition.date;
        parsedTransitions.push(transitionConfig);
    }
    return parsedTransitions;
}

function validateTransitionsType(ruleName: string, transitions: S3LifecycleTransition[], errors: string[]): void {
    const validTypes = ['ia', 'glacier', 'expiration'];
    for (const transition of transitions) {
        // Require valid types
        if (!validTypes.includes(transition.type)) {
            errors.push(`${ruleName}: You must specify transition type of ${validTypes.join(', ')}`);
        }

        // Require type ia and days > 30
        if (transition.type === 'ia' && transition.days && transition.days < 30) {
            errors.push(`${ruleName}: Infrequent access has a minimum age of 30 days`);
        }
    }
}

function validateTransitionsDayDate(ruleName: string, transitions: S3LifecycleTransition[], errors: string[]): void {
    let day = false;
    let date = false;
    for (const transition of transitions) {
        // tally days vs dates
        if (transition.days) {
            day = true;
        }
        if (transition.date) {
            date = true;
        }
        // required day or dates key
        if (!day && !date) {
            errors.push(`${ruleName}: You must specify one of either days or dates in transitions rules`);
        }
    }
    // Require consistent days vs dates
    if (day && date) {
        errors.push(`${ruleName}: You must specify only either days or dates in transitions rules`);
    }
}

/**
 * Given the service, this function returns configuration for the s3 lifecycles
 * in the task definition.
 *
 * Users may specify from 1 to n s3 lifecycles in their configuration, so this function will return
 * a list of 1 to n lifecycles.dlebarsS3Lif
 */
export function getLifecycleConfig(ownServiceContext: ServiceContext<S3ServiceConfig>): HandlebarsS3LifecycleConfig[] | undefined {
    const serviceParams = ownServiceContext.params;
    const lifecycleConfigs = [];
    // skip if no lifecycles
    if (!serviceParams.lifecycles) {
        return;
    }

    for (const rule of serviceParams.lifecycles) {
        const lifecycleConfig: HandlebarsS3LifecycleConfig = {
            name: rule.name,
            prefix: rule.prefix,
            status: rule.status || 'Enabled'
        };

        if (rule.transitions) {
            const expiration = getExpiration(rule.transitions);
            if (expiration.type === 'days') {
                lifecycleConfig.expiration_days = expiration.value as number;
            }
            else if (expiration.type === 'date') {
                lifecycleConfig.expiration_date = expiration.value as string;
            }

            lifecycleConfig.transitions = getTransitions(rule.transitions);
        }

        if (rule.version_transitions) {
            const versionExpiration = getExpiration(rule.version_transitions);
            lifecycleConfig.noncurrent_version_expiration_days = versionExpiration.value as number || null;
            lifecycleConfig.noncurrent_version_transitions = getTransitions(rule.version_transitions);
        }
        lifecycleConfigs.push(lifecycleConfig);
    }
    return lifecycleConfigs;
}

/**
 * This function is called by the "check" lifecycle phase to check the information in the
 * "lifecycles" section in the Handel service configuration
 * RFE: Require expiration to be older than other rules
 */
export function checkLifecycles(serviceContext: ServiceContext<S3ServiceConfig>, errors: string[]) {
    const params = serviceContext.params;
    const lifecycles = params.lifecycles;

    // if no lifecycle section skip check
    if (!lifecycles) {
        return;
    }

    for (const rule of lifecycles) {
        // Require version enabled for version__transitions
        if (rule.version_transitions && params.versioning !== 'enabled') {
            errors.push(`${rule.name}: You must enable versioning to have version transition rules`);
        }

        if (rule.transitions) {
            validateTransitionsType(rule.name, rule.transitions, errors);
            validateTransitionsDayDate(rule.name, rule.transitions, errors);
        }

        if (rule.version_transitions) {
            validateTransitionsType(rule.name, rule.version_transitions, errors);
            for (const transition of rule.version_transitions) {
                // require version_transitions to only have days
                if (!transition.days) {
                    errors.push(`${rule.name}: You must specify only days in version transitions rules`);
                }
            }
        }
    }
}
