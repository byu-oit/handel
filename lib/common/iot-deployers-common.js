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

exports.getTopicRuleNamePrefix = function (producerServiceContext) {
    return `${producerServiceContext.appName}_${producerServiceContext.environmentName}_${producerServiceContext.serviceName}`.replace(/-/g, "_");
}

/**
 * Given the service context of an IOT service that will be producing events via a topic rule,
 * and the configuration for an event_consumer that the service will be producing to, this function
 * returns the generated name of the topic rule.
 * 
 * NOTE: This doesn't use the usual deployPhaseCommon.getResourceName because the IOT service requires
 * underscores rather than dashes, so we convert all dashes to underscores here.
 */
exports.getTopicRuleName = function (producerServiceContext, eventConsumerConfig) {
    let ruleNamePrefix = exports.getTopicRuleNamePrefix(producerServiceContext);
    return `${ruleNamePrefix}_${eventConsumerConfig.service_name}`.replace(/-/g, "_");
}

exports.getTopicRuleArnPrefix = function (topicRuleNamePrefix, accountConfig) {
    let topicPrefixSub = topicRuleNamePrefix.replace(/-/g, "_");
    return `arn:aws:iot:${accountConfig.region}:${accountConfig.account_id}:rule/${topicPrefixSub}`;
}

exports.getTopicRuleArn = function (topicRuleArnPrefix, consumerServiceName) {
    let consumerServiceNameSub = consumerServiceName.replace(/-/g, "_")
    return `${topicRuleArnPrefix}_${consumerServiceNameSub}`;
}