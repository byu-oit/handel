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
import { EnvironmentVariables, ServiceConfig } from 'handel-extension-api';

export interface APIGatewayConfig extends ServiceConfig {
    proxy?: ProxyPassthroughConfig;
    swagger?: string;
    description?: string;
    binary_media_types?: string[];
    environment_variables?: EnvironmentVariables;
    vpc?: boolean;
    custom_domains?: CustomDomain[];
}

export interface ProxyPassthroughConfig {
    path_to_code: string;
    runtime: string;
    handler: string;
    memory?: number;
    timeout?: number;
    environment_variables?: EnvironmentVariables;
}

export interface CustomDomain {
    dns_name: string;
    https_certificate: string;
    // We could eventually add a 'path' here, but without allowing shared custom domains, there really isn't a use case for it
}
