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
import { DeployContext, ServiceConfig, ServiceContext, UnDeployContext } from 'handel-extension-api';
import { awsCalls } from 'handel-extension-support';
import * as uuid from 'uuid';

export function getDeployContext(serviceContext: ServiceContext<ServiceConfig>,
                                 rdsCfStack: any) { // TODO - Better type later
    const deployContext = new DeployContext(serviceContext);

    // Inject ENV variables to talk to this database
    const address = awsCalls.cloudFormation.getOutput('DatabaseAddress', rdsCfStack);
    const port = awsCalls.cloudFormation.getOutput('DatabasePort', rdsCfStack);
    const dbName = awsCalls.cloudFormation.getOutput('DatabaseName', rdsCfStack);

    if(!address || !port || !dbName) {
        throw new Error('Expected RDS service to return address, port, and dbName');
    }

    deployContext.addEnvironmentVariables({
        ADDRESS: address,
        PORT: port,
        DATABASE_NAME: dbName
    });

    return deployContext;
}

export function getNewDbUsername() {
    // This is a really hacky username generator that matches all the requirements of the different engines
    // Someone should really put a better way for generating these in here...
    return 'h' + uuid().replace(/-/gi, '').substring(0, 15);
}

export function getNewDbPassword() {
    // This is a really hacky password generator that matches all the requirements of the different engines
    // Someone should really put a better way for generating these in here...
    return uuid().substring(0, 30);
}
