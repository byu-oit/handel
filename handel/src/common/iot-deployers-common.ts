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
import { AccountConfig, ServiceConfig, ServiceContext, ServiceEventConsumer } from 'handel-extension-api';

export function getTopicRuleNamePrefix(producerServiceContext: ServiceContext<ServiceConfig>) {
    return `${producerServiceContext.appName}_${producerServiceContext.environmentName}_${producerServiceContext.serviceName}`.replace(/-/g, '_');
}

/**
 * Given the service context of an IOT service that will be producing events via a topic rule,
 * and the configuration for an event_consumer that the service will be producing to, this function
 * returns the generated name of the topic rule.
 *
 * NOTE: This doesn't use the usual serviceContext.getStackName because the IOT service requires
 * underscores rather than dashes, so we convert all dashes to underscores here.
 */
export function getTopicRuleName(producerServiceContext: ServiceContext<ServiceConfig>, eventConsumerConfig: ServiceEventConsumer) { // TODO - Need to get this lined up better
    const ruleNamePrefix = exports.getTopicRuleNamePrefix(producerServiceContext);
    return `${ruleNamePrefix}_${eventConsumerConfig.service_name}`.replace(/-/g, '_');
}

export function getTopicRuleArnPrefix(topicRuleNamePrefix: string, accountConfig: AccountConfig) {
    const topicPrefixSub = topicRuleNamePrefix.replace(/-/g, '_');
    return `arn:aws:iot:${accountConfig.region}:${accountConfig.account_id}:rule/${topicPrefixSub}`;
}

export function getTopicRuleArn(topicRuleArnPrefix: string, consumerServiceName: string) {
    const consumerServiceNameSub = consumerServiceName.replace(/-/g, '_');
    return `${topicRuleArnPrefix}_${consumerServiceNameSub}`;
}
