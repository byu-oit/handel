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

import { AccountConfig } from './account-config';

export class ServiceContext {
    public appName: string;
    public environmentName: string;
    public serviceName: string;
    public serviceType: string;
    public params: any;
    public accountConfig: AccountConfig;

    constructor(appName: string,
                environmentName: string,
                serviceName: string,
                serviceType: string,
                params: any,
                accountConfig: AccountConfig) {
            this.appName = appName;
            this.environmentName = environmentName;
            this.serviceName = serviceName;
            this.serviceType = serviceType;
            this.params = params;
            this.accountConfig = accountConfig;
    }
}
