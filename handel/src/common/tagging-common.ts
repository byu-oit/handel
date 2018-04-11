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
import {ServiceConfig, ServiceContext, Tags} from 'handel-extension-api';

export const TAG_KEY_PATTERN = `[a-zA-Z0-9+\-=._:\\/@]{1,127}`;
export const TAG_KEY_REGEX = RegExp(`^${TAG_KEY_PATTERN}$`);
export const TAG_VALUE_MAX_LENGTH = 255;

export function getTags(serviceContext: ServiceContext<ServiceConfig>): Tags {
    const serviceParams = serviceContext.params;

    const handelTags: Tags = {
        app: serviceContext.appName,
        env: serviceContext.environmentName
    };

    const appTags = serviceContext.tags;

    const serviceTags = serviceParams.tags;

    // Service tags overwrite app tags, which overwrite Handel tags
    return Object.assign({}, handelTags, appTags, serviceTags);
}
