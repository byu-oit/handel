/*
 * Copyright 2017 Brigham Young University
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

function getExpiration(transitions) {
    let expiration = {};
    for (let transition of transitions) {
        if (transition.type === 'expiration') {
            expiration.type = transition.days ? 'days' : 'date';
            expiration.value = expiration.type === 'days' ? transition.days : transition.date;
        }
    }
    return expiration;
}


function getTransitions(transitions) {
    let parsed_transitions = [];
    for (let transition of transitions) {
        let transition_config = {};
        switch (transition.type) {
            case 'ia':
                transition_config.type = 'STANDARD_IA';
                break;
            case 'glacier':
                transition_config.type = 'GLACIER';
                break;
            default:
                continue;
        }
        transition_config.days = transition.days;
        transition_config.date = transition.date;
        parsed_transitions.push(transition_config)
    }
    return parsed_transitions;
}


function validateTransitionsType(serviceName, ruleName, transitions, errors) {
    let valid_types = ['ia', 'glacier', 'expiration'];
    for (let transition of transitions) {
        // Require valid types
        if (!valid_types.includes(transition.type)) {
            errors.push(`${serviceName} - ${ruleName}: You must specify transition type of ${valid_types.join(', ')}`);
        }

        //Require type ia and days > 30
        if (transition.type === 'ia' && transition.days < 30) {
            errors.push(`${serviceName} - ${ruleName}: Infrequent access has a minimum age of 30 days`);
        }
    }
}


function validateTransitionsDayDate(serviceName, ruleName, transitions, errors) {
    let day, date = false;
    for (let transition of transitions) {
        // tally days vs dates
        if (transition.days) {
            day = true;
        }
        if (transition.date) {
            date = true;
        }
        // required day or dates key
        if (!day && !date) {
            errors.push(`${serviceName} - ${ruleName}: You must specify one of either days or dates in transitions rules`);
        }
    }
    //Require consistent days vs dates
    if (day && date) {
        errors.push(`${serviceName} - ${ruleName}: You must specify only either days or dates in transitions rules`);
    }
}


/**
 * Given the service, this function returns configuration for the s3 lifecycles
 * in the task definition.
 * 
 * Users may specify from 1 to n s3 lifecycles in their configuration, so this function will return
 * a list of 1 to n lifecycles.
 */
exports.getLifecycleConfig = function (ownServiceContext) {
    let serviceParams = ownServiceContext.params;
    let lifecycleConfigs = [];
    //skip if no lifecycles
    if (!serviceParams.lifecycles) {
        return;
    }
    
    for (let rule of serviceParams.lifecycles) {
        let lifecycleConfig = {};

        lifecycleConfig.name = rule.name;
        lifecycleConfig.prefix = rule.prefix;
        lifecycleConfig.status = rule.status || 'Enabled';


        if (rule.transitions){
            let expiration = getExpiration(rule.transitions);
            if (expiration.type === 'days') {
                lifecycleConfig.expiration_days = expiration.value;
            }
            else if (expiration.type === 'date') {
                lifecycleConfig.expiration_date = expiration.value;
            }

            lifecycleConfig.transitions = getTransitions(rule.transitions);
        }

        if (rule.version_transitions) {
            let version_expiration = getExpiration(rule.version_transitions);
            lifecycleConfig.noncurrent_version_expiration_days = version_expiration.value || null;
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
exports.checkLifecycles = function (serviceContext, serviceName, errors) {
    let params = serviceContext.params;
    let lifecycles = params.lifecycles;
    
    //if no lifecycle section skip check
    if (!lifecycles){
        return
    }

    for (let rule of lifecycles) {
        //Require name
        if (!rule.name) {
            errors.push(`${serviceName} - You must specify name in the 'lifecycles' section`);
        }

        //Require at least one 'transition'
        if (!rule.transitions && !rule.version_transitions) {
            errors.push(`${serviceName} - ${rule.name}: You must specify at least one transition or version transition in the 'lifecycles' section`);
        }

        //Require version enabled for version__transitions
        if (rule.version_transitions && params.versioning !== 'enabled') {
            errors.push(`${serviceName} - ${rule.name}: You must enable versioning to have version transition rules`);
        }
        
        if (rule.transitions) {
            validateTransitionsType(serviceName, rule.name, rule.transitions, errors);
            validateTransitionsDayDate(serviceName, rule.name, rule.transitions, errors);
        }

        if (rule.version_transitions){
            validateTransitionsType(serviceName, rule.name, rule.version_transitions, errors);
            for (let transition of rule.version_transitions) {
                //require version_transitions to only have days
                if (!transition.days){
                    errors.push(`${serviceName} - ${rule.name}: You must specify only days in version transitions rules`)
                }
            }
        }
    }
}