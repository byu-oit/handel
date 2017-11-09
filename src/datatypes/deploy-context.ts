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
import { ServiceContext } from './service-context';

export class DeployContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: string;
    // Any outputs needed for producing/consuming events for this service
    public eventOutputs: any;
    // Policies the consuming service can use when creating service roles in order to talk to this service
    public policies: any[];
    // Items intended to be made securely available to the consuming service (via a secure S3 location)
    public credentials: any[];
    // Items intended to be injected as environment variables into the consuming service
    public environmentVariables: any;
    // Scripts intended to be run on startup by the consuming resource.
    public scripts: string[];

    constructor(serviceContext: ServiceContext) {
        this.appName = serviceContext.appName;
        this.environmentName = serviceContext.environmentName;
        this.serviceName = serviceContext.serviceName;
        this.serviceType = serviceContext.serviceType;
        this.eventOutputs = {};
        this.policies = [];
        this.credentials = [];
        this.environmentVariables = {};
        this.scripts = [];
    }

    public addEnvironmentVariables(vars: object) {
        Object.assign(this.environmentVariables, vars);
    }
}
