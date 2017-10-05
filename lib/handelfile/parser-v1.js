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
const _ = require('lodash');
const ServiceContext = require('../datatypes/service-context');
const EnvironmentContext = require('../datatypes/environment-context');

const APP_ENV_SERVICE_NAME_REGEX = /^[a-zA-Z0-9-]+$/;

/**
 * Checks the top-level name field for correctness.
 * 
 * @param {Object} handelFile - The object containing the loaded Handel file
 * @throws {Error} - The validation error containing a human-readable message about the issue in the Handel file validation.
 */
function checkTopLevelFields(handelFile) {
    let errors = [];

    //Check that 'version' field matches requirements
    if (!handelFile.version) {
        errors.push(`The top-level 'version' field is required`);
    }

    //Check that 'name' field matches requirements
    if (!handelFile.name) {
        errors.push(`The top-level 'name' field is required`);
    }
    if (!handelFile.name.match(APP_ENV_SERVICE_NAME_REGEX)) {
        errors.push(`The top-level 'name' field may contain only alphanumeric characters and dashes`);
    }
    let maxLengthName = 30;
    if (handelFile.name.length > maxLengthName) {
        errors.push(`The top-level 'name' field may not be greater than ${maxLengthName} characters`);
    }

    return errors;
}

/**
 * Checks the Handel environment fields for correctness.
 * 
 * There are limits and requirements for each of the environment and service names, and this is where those are
 * checked.
 * 
 * Service-specific parameters are not checked here. Instead, they are checked as one of the phases in
 * the deployer lifecycle, so the deployers themselves implement parameter checking for their service.
 * 
 * @param {Object} handelFile - The object containing the loaded Handel file.
 * @param {Object} serviceDeployers - The object containing the service deployer objects by service type
 * @throws {Error} - The validation error containing a human-readable message about the issue in the Handel file validation.
 */
function checkEnvironments(handelFile, serviceDeployers) {
    let errors = [];

    //Check that top-level 'environments' field matches requirements
    if (!handelFile.environments) {
        errors.push(`The top-level 'environments' field is required`);
    }
    if (Object.keys(handelFile.environments).length === 0) {
        errors.push(`The 'environments' field must contain 1 or more environment definitions`)
    }

    //Check that each environment matches requirements
    for (let envName in handelFile.environments) {
        if (!envName.match(APP_ENV_SERVICE_NAME_REGEX)) {
            errors.push(`Environment name fields may only contain alphanumeric characters and dashes. You provided the invalid name ${envName}`);
        }
        let maxLengthEnv = 10;
        if (envName.length > maxLengthEnv) {
            errors.push(`Environment name fields may not be greater than ${maxLengthEnv} characters. You provided the invalid name ${envName}`);
        }

        //Check that each service matches overall requirements (service-specific params validation is performed by the services themselves)
        for (let serviceName in handelFile.environments[envName]) {
            if (!serviceName.match(APP_ENV_SERVICE_NAME_REGEX)) {
                errors.push(`Service name fields may only contain alphanumeric characters and dashes. You provided the invalid name ${serviceName}`);
            }
            let maxLengthService = 20;
            if (serviceName.length > maxLengthService) {
                errors.push(`Service name fields may not be greater than ${maxLengthService} characters. You provided the invalid name ${serviceName}`);
            }
            let serviceType = handelFile.environments[envName][serviceName].type
            if (!serviceType) {
                errors.push(`Services must declare service type in the 'type' field. Your service '${serviceName}' does not have a type`);
            }

            //Check that specified service type is supported by Handel
            if (!serviceDeployers[serviceType]) {
                errors.push(`Unsupported service type specified '${serviceType}'`);
            }
        }
    }

    return errors;
}

/**
 * Checks the dependencies of each service to make sure that it is consumable by that service
 * 
 * This is accomlished via the "producedDeployOutputTypes" and "consumedDeployOutputTypes" lists from
 * the deployer contract, where the deployers specify what output types they are able to produce and
 * consume
 * 
 * @param {Object} handelFile - The object containg the loaded Handel file.
 * @param {Object} serviceDeployers - The object containing the loaded service deployer objects by type.
 * @throws {Error} - The validation error containing a human-readable message about the issue in the Handel file validation.
 */
function checkServiceDependencies(handelFile, serviceDeployers) {
    let errors = [];

    for (let envName in handelFile.environments) {
        let environmentDef = handelFile.environments[envName];
        for (let serviceName in environmentDef) {
            let serviceDef = environmentDef[serviceName];
            if (serviceDef.dependencies) { //Analyze those services that declare dependencies
                for (let dependentServiceName of serviceDef.dependencies) {
                    //Make sure the dependent service exists in the environment
                    if (!environmentDef[dependentServiceName]) {
                        errors.push(`You declared a dependency '${dependentServiceName}' in the service '${serviceName}' that doesn't exist`);
                    }
                    let dependentServiceDef = environmentDef[dependentServiceName];

                    //Make sure the dependent service produces outputs that the consuming service can consume
                    let serviceDeployer = serviceDeployers[serviceDef.type];
                    let dependentServiceDeployer = serviceDeployers[dependentServiceDef.type];
                    let serviceConsumedOutputs = serviceDeployer.consumedDeployOutputTypes;
                    let dependentServiceProducedOutputs = dependentServiceDeployer.producedDeployOutputTypes;
                    //_.difference usage here checks to see if dependentServiceProducedOutputs is a subset of serviceConsumedOutputs
                    if (_.difference(dependentServiceProducedOutputs, serviceConsumedOutputs).length > 0) {
                        errors.push(`The '${dependentServiceDef.type}' service type is not consumable by the '${serviceDef.type}' service type`);
                    }
                }
            }
        }
    }

    return errors;
}

/**
 * Checks the event_consumers of each service (if any) to make sure the producers and consumers are
 * compatible with each other
 * 
 * This is accomplished via the "producedEventsSupportedServices" list from the
 * deployer contract, where the deployers specify what services (if any) can consume events
 * from that service. 
 * 
 * @param {Object} handelFile - The object containg the loaded Handel file.
 * @param {Object} serviceDeployers - The object containing the loaded service deployer objects by type.
 * @throws {Error} - The validation error containing a human-readable message about the issue in the Handel file validation.
 */
function checkEventConsumers(handelFile, serviceDeployers) {
    let errors = [];

    for (let envName in handelFile.environments) {
        let environmentDef = handelFile.environments[envName];
        for (let serviceName in environmentDef) {
            let serviceDef = environmentDef[serviceName];
            if (serviceDef.event_consumers) {
                for (let eventConsumerService of serviceDef.event_consumers) {
                    let eventConsumerServiceName = eventConsumerService.service_name;

                    //Make sure the event consumer service exists in the environment
                    if (!environmentDef[eventConsumerServiceName]) {
                        errors.push(`You declared an event consumer '${eventConsumerServiceName}' in the service '${serviceName}' that doesn't exist`);
                    }
                    let eventConsumerServiceDef = environmentDef[eventConsumerServiceName];

                    let serviceDeployer = serviceDeployers[serviceDef.type];
                    let supportedConsumerTypes = serviceDeployer.producedEventsSupportedServices;
                    if (!supportedConsumerTypes.includes(eventConsumerServiceDef.type)) {
                        errors.push(`The '${eventConsumerServiceDef.type}' service type can't consume events from the '${serviceDef.type}' service type`);
                    }
                }
            }
        }
    }

    return errors;
}


/**
 * Ensure that the top-level of the Handel file is valid.
 * 
 * This does not check the individual services in the file, those are handled by the 
 * service deployer themselves.
 * 
 * @param {Object} handelFile - The object containg the loaded Handel file.
 * @param {Object} serviceDeployers - The object containing the loaded service deployer objects by type.
 * @throws {Error} - The validation error containing a human-readable message about the issue in the Handel file validation.
 */
exports.validateHandelFile = function (handelFile, serviceDeployers) {
    let errors = checkTopLevelFields(handelFile); //Check that 'name' field matches requirements
    errors = errors.concat(checkEnvironments(handelFile, serviceDeployers)); //Check that environment and services are valid (not all ones will work);
    errors = errors.concat(checkServiceDependencies(handelFile, serviceDeployers));
    errors = errors.concat(checkEventConsumers(handelFile, serviceDeployers));
    return errors;
};

/**
 * Given a Handel file, returns the EnvironmentContext for the requested environment.
 * 
 * Assume all validation has been done previously, so jsut create the EnvironmentContext
 * 
 * @param {Object} handelFile - The Object representing the provided YAML deploy spec file
 * @param {String} environmentName - The name of the environment in the deploy spec for which we want the EnvironmentContext
 * @param {String} deployVersion - The version of the app being deployed
 * @returns {EnvironmentContext} - The generated EnvironmentContext from the specified environment in the Handel file
 */
exports.createEnvironmentContext = function (handelFile, environmentName, deployVersion, accountConfig) {
    let environmentSpec = handelFile.environments[environmentName];
    if (!environmentSpec) {
        throw new Error(`Can't find the requested environment in the deploy spec: ${environmentName}`)
    }

    let environmentContext = new EnvironmentContext(handelFile.name, deployVersion, environmentName, accountConfig);

    _.forEach(environmentSpec, function (serviceSpec, serviceName) {
        var serviceType = serviceSpec.type;
        var serviceContext = new ServiceContext(handelFile.name, environmentName, serviceName,
            serviceType, deployVersion, serviceSpec, accountConfig);
        environmentContext.serviceContexts[serviceName] = serviceContext;
    });

    return environmentContext;
}

