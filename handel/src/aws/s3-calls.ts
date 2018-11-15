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
import * as AWS from 'aws-sdk';
import * as childProcess from 'child_process';
import { ServiceEventType } from 'handel-extension-api';
import awsWrapper from './aws-wrapper';

function awsCliExists() {
    return new Promise((resolve, reject) => {
        childProcess.exec('aws configure list', (err, stdout, stderr) => {
            if (!err) {
                resolve(true);
            }
            else {
                if (err.message.includes('command not found')) {
                    resolve(false);
                }
                else {
                    reject(new Error(`Unknown error occurred while trying to find the AWS CLI on your system: ${err}`));
                }
            }
        });
    });
}

/**
 * Uploads an entire directory to an S3 bucket with the given key prefix
 *
 * THIS FUNCTION REQUIRES AN EXTERNAL DEPENDNCY. It requires the awscli
 * command-line tool installable via pip. It seems to be the only good way
 * to do an S3 directory sync, and I don't want to write a good one myself
 * in Node
 */
export function uploadDirectory(bucketName: string, keyPrefix: string, dirToUpload: string) {
    return new Promise((resolve, reject) => {
        awsCliExists()
            .then(exists => {
                if(exists) {
                    const child = childProcess.spawn('aws', ['s3', 'sync', dirToUpload, `s3://${bucketName}/${keyPrefix}`, '--delete']);
                    child.stdout.on('data', (data) => {
                        // console.log('AWS CLI stderr: ' + data);
                    });
                    child.stderr.on('data', (data) => {
                        console.log('AWS CLI stderr: ' + data);
                    });

                    child.on('close', (code) => {
                        if(code !== 0) {
                            reject(new Error(`Error in AWS CLI when uploading files to S3 bucket`));
                        }
                        else {
                            resolve(true);
                        }
                    });
                    child.on('error', (err) => {
                        reject(err);
                    });
                }
                else {
                    reject(new Error(`You are using the S3 Static Site service, which requires you to have the Python AWS CLI installed. Please go to https://aws.amazon.com/cli/ for help installing it.`));
                }
            })
            .catch(err => {
                reject(err);
            });
    });
}

// TODO - I would like to find a way to reduce duplication in this function. The TS types make it difficult to generalize this the way I would in untyped JS
export async function configureBucketNotifications(bucketName: string, notificationType: ServiceEventType, notificationArn: string, notificationEvents: AWS.S3.EventList, eventFilters: AWS.S3.FilterRuleList) {
    const putNotificationParams: AWS.S3.PutBucketNotificationConfigurationRequest = {
        Bucket: bucketName,
        NotificationConfiguration: {}
    };

    // Configure filters if any provided
    let filterConfig: AWS.S3.NotificationConfigurationFilter | null = null;
    if (eventFilters.length > 0) {
        filterConfig = {
            Key: {
                FilterRules: eventFilters
            },
        };
    }

    if (notificationType === ServiceEventType.Lambda) {
        putNotificationParams.NotificationConfiguration.LambdaFunctionConfigurations = [{
            LambdaFunctionArn: notificationArn,
            Events: notificationEvents,
        }];
        if (filterConfig) {
            putNotificationParams.NotificationConfiguration.LambdaFunctionConfigurations[0].Filter = filterConfig;
        }
    }
    else if (notificationType === ServiceEventType.SNS) {
        putNotificationParams.NotificationConfiguration.TopicConfigurations = [{
            TopicArn: notificationArn,
            Events: notificationEvents
        }];
        if (filterConfig) {
            putNotificationParams.NotificationConfiguration.TopicConfigurations[0].Filter = filterConfig;
        }
    }
    else if (notificationType === ServiceEventType.SQS) {
        putNotificationParams.NotificationConfiguration.QueueConfigurations = [{
            QueueArn: notificationArn,
            Events: notificationEvents
        }];
        if (filterConfig) {
            putNotificationParams.NotificationConfiguration.QueueConfigurations[0].Filter = filterConfig;
        }
    }
    else {
        throw new Error(`Invalid/unsupported notification type from S3 bucket specified: ${notificationType}`);
    }
    return awsWrapper.s3.putBucketNotificationConfiguration(putNotificationParams);
}
