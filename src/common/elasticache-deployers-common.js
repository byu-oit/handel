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

/**
 * Given the stack name, returns the name of the Elasticache cluster
 * 
 * ElastiCache only allows for a 20-char max cluster name, which means we have to truncate our stack
 * name to fit in it.
 */
exports.getClusterName = function(serviceContext) {
    let appFragment = serviceContext.appName.substring(0, 9);
    let envFragement = serviceContext.environmentName.substring(0, 3);
    let serviceFragment = serviceContext.serviceName.substring(0, 6);
    return `${appFragment}-${envFragement}-${serviceFragment}`;
}