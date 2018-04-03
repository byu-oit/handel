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
import { ServiceConfig } from 'handel-extension-api';

export interface SqsServiceConfig extends ServiceConfig {
    queue_type?: string;
    delay_seconds?: number;
    content_based_deduplication?: boolean;
    max_message_size?: number;
    message_retention_period?: number;
    receive_message_wait_time_seconds?: number;
    visibility_timeout?: number;
    dead_letter_queue?: SqsDeadLetterQueue;
}

export interface SqsDeadLetterQueue {
    max_receive_count?: number;
    delay_seconds?: number;
    max_message_size?: number;
    message_retention_period?: number;
    receive_message_wait_time_seconds?: number;
    visibility_timeout?: number;
}

export interface HandlebarsSqsTemplate {
    queueName: string;
    delaySeconds: number;
    receiveMessageWaitTimeSeconds: number;
    maxMessageSize: number;
    messageRetentionPeriod: number;
    visibilityTimeout: number;
    deadLetterPolicy: boolean;
    fifoQueue?: boolean;
    contentBasedDeduplication?: boolean;
    redrivePolicy?: boolean;
    deadLetterQueueName?: string;
    deadLetterMaxReceiveCount?: number;
    deadLetterDelaySeconds?: number;
    deadLetterMaxMessageSize?: number;
    deadLetterMessageRetentionPeriod?: number;
    deadLetterReceiveMessageWaitTimeSeconds?: number;
    deadLetterVisibilityTimeout?: number;
}
