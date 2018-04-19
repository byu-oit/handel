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
import * as fs from 'fs';
import {
    AccountConfig,
    DeployContext,
    EnvironmentVariables,
    ServiceConfig,
    ServiceContext,
    Tags
} from 'handel-extension-api';
import * as os from 'os';
import * as cloudFormationCalls from '../aws/cloudformation-calls';
import * as s3Calls from '../aws/s3-calls';
import * as util from '../util/util';

export async function deployCloudFormationStack(stackName: string, cfTemplate: string, cfParameters: AWS.CloudFormation.Parameters, updatesSupported: boolean, serviceType: string, timeoutInMinutes: number, stackTags: Tags) {
    const stack = await cloudFormationCalls.getStack(stackName);
    if (!stack) {
        return cloudFormationCalls.createStack(stackName, cfTemplate, cfParameters, timeoutInMinutes, stackTags);
    }
    else {
        if (updatesSupported) {
            return cloudFormationCalls.updateStack(stackName, cfTemplate, cfParameters, stackTags);
        }
        else { // Updates not supported, so just return stack
            return stack;
        }
    }
}

export function getHandelUploadsBucketName(accountConfig: AccountConfig) {
    return `handel-${accountConfig.region}-${accountConfig.account_id}`;
}

export async function uploadFileToHandelBucket(diskFilePath: string, artifactPrefix: string, s3FileName: string, accountConfig: AccountConfig): Promise<AWS.S3.ManagedUpload.SendData> {
    const bucketName = getHandelUploadsBucketName(accountConfig);

    const artifactKey = `${artifactPrefix}/${s3FileName}`;
    const bucket = await s3Calls.createBucketIfNotExists(bucketName, accountConfig.region, accountConfig.handel_resource_tags); // Ensure Handel bucket exists in this region
    const s3ObjectInfo = await s3Calls.uploadFile(bucketName, artifactKey, diskFilePath);
    await s3Calls.cleanupOldVersionsOfFiles(bucketName, artifactPrefix);
    return s3ObjectInfo;
}

export async function uploadDirectoryToHandelBucket(directoryPath: string, artifactPrefix: string, s3FileName: string, accountConfig: AccountConfig): Promise<AWS.S3.ManagedUpload.SendData> {
    const zippedPath = `${os.tmpdir()}/${s3FileName}.zip`;
    await util.zipDirectoryToFile(directoryPath, zippedPath);
    const s3ObjectInfo = await uploadFileToHandelBucket(zippedPath, artifactPrefix, s3FileName, accountConfig);
    // Delete temporary file
    fs.unlinkSync(zippedPath);
    return s3ObjectInfo;
}

export async function uploadDeployableArtifactToHandelBucket(serviceContext: ServiceContext<ServiceConfig>, pathToArtifact: string, s3FileName: string): Promise<AWS.S3.ManagedUpload.SendData> {
    const accountConfig = serviceContext.accountConfig;
    const fileStats = fs.lstatSync(pathToArtifact);
    const artifactPrefix = `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}`;
    if (fileStats.isDirectory()) { // Zip up artifact and upload it
        return uploadDirectoryToHandelBucket(pathToArtifact, artifactPrefix, s3FileName, accountConfig);
    }
    else { // Is file (i.e. WAR file or some other already-compiled archive), just upload directly
        return uploadFileToHandelBucket(pathToArtifact, artifactPrefix, s3FileName, accountConfig);
    }
}
