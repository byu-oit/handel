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
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as winston from 'winston';
import awsWrapper from './aws-wrapper';

function getObjectsToDelete(objects: AWS.S3.Object[]) {
    const objectsToDelete: AWS.S3.Object[] = [];

    // Sort by date
    objects.sort((a, b) => {
        return b.LastModified!.getTime() - a.LastModified!.getTime();
    });

    // Always keep 5 most recent versions (no matter how old), then delete anything else older than 30 days
    if (objects.length > 5) {
        for (let i = 5; i < objects.length; i++) {
            const object = objects[i];
            const now = new Date();
            const diff = Math.abs(now.getTime() - object.LastModified!.getTime());
            const daysOld = diff / (1000 * 60 * 60 * 24);
            if (daysOld > 30) {
                objectsToDelete.push(object);
            }
        }
    }

    return objectsToDelete;
}

/**
 * Delete all objects with a matching prefix from the given bucket
 */
export async function deleteMatchingPrefix(bucketName: string, prefix: string) {
    winston.info(`Deleting service files from bucket ${bucketName} with prefix ${prefix}`);

    const listObjectsParams = {
        Bucket: bucketName,
        Prefix: prefix
    };
    try {
        const listObjectsResponse = await awsWrapper.s3.listObjectsV2(listObjectsParams);
        winston.verbose('Delete list', listObjectsResponse);
        const deleteObjectsParams: AWS.S3.DeleteObjectsRequest = {
            Bucket: listObjectsResponse.Name!,
            Delete: {
                Objects: [],
                Quiet: false
            }
        };
        for (const fl of listObjectsResponse.Contents!) {
            winston.verbose(`Deleting service file ${fl.Key} from ${listObjectsResponse.Name}`);
            deleteObjectsParams.Delete.Objects.push({
                Key: fl.Key!
            });
        }
        winston.verbose('Delete', deleteObjectsParams);
        if (deleteObjectsParams.Delete.Objects.length === 0) {
            return null;
        }
        const deleteObjectsResponse = await awsWrapper.s3.deleteObjects(deleteObjectsParams);
        winston.verbose('Delete results', deleteObjectsResponse);
        return deleteObjectsResponse;
    }
    catch (err) {
        winston.info('Delete s3 artifacts warning', JSON.stringify(err, null, 2));
        return null;
    }
}

/**
 * Uploads the given file to a bucket with the given key
 */
export async function uploadFile(bucketName: string, key: string, filePath: string) {
    const fileStream = fs.createReadStream(filePath);

    const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: bucketName,
        Key: key,
        Body: fileStream
    };

    winston.verbose(`Uploading file ${filePath} to ${bucketName}/${key}`);
    const uploadResponse = await awsWrapper.s3.upload(uploadParams);
    winston.verbose(`Uploaded file ${filePath} to ${bucketName}/${key}`);
    return uploadResponse;
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
        const cmd = `aws s3 sync ${dirToUpload} s3://${bucketName}/${keyPrefix} --delete`;
        childProcess.exec(cmd, (err, stdout, stderr) => {
            if (!err) {
                resolve(true);
            }
            else {
                if (err.message.includes('command not found')) {
                    reject(new Error(`You are using the S3 Static Site service, which requires you to have the Python AWS CLI installed. Please go to https://aws.amazon.com/cli/ for help installing it.`));
                }
                else {
                    reject(err);
                }
            }
        });
    });
}

/**
 * Lists the files in a bucket for the given key prefix
 *
 * This method isn't sufficient currently for huge numbers of files under
 * a given prefix, since it only returns the first 1000 objects.
 * For Handel's purposes this is probably fine, but may need to be
 * extended in the future if we start getting more than 1000 objects
 * under a given key prefix
 */
export async function listFilesByPrefix(bucketName: string, keyPrefix: string) {
    const listParams = {
        Bucket: bucketName,
        MaxKeys: 1000,
        Prefix: keyPrefix,
    };

    const listResponse = await awsWrapper.s3.listObjectsV2(listParams);
    let objects: AWS.S3.Object[] = [];
    if (listResponse.Contents) {
        objects = listResponse.Contents;
    }
    return objects;
}

/**
 * Deletes the given objects from the S3 bucket
 */
export function deleteFiles(bucketName: string, objects: AWS.S3.Object[]) {
    const objectsToDelete = [];
    for (const object of objects) {
        objectsToDelete.push({
            Key: object.Key!
        });
    }

    const deleteParams = {
        Bucket: bucketName,
        Delete: {
            Objects: objectsToDelete,
            Quiet: true
        }
    };
    return awsWrapper.s3.deleteObjects(deleteParams);
}

/**
 * Cleans up all objects in a bucket with a certain key prefix that are
 * older than 30 days.
 *
 * This method keeps at least the 5 most recent objects, no matter how
 * old they are.
 */
export async function cleanupOldVersionsOfFiles(bucketName: string, keyPrefix: string) {
    const objects = await listFilesByPrefix(bucketName, keyPrefix);
    const objectsToDelete = getObjectsToDelete(objects);
    if (objectsToDelete.length > 0) {
        winston.info(`Deleting ${objectsToDelete.length} old versions older than 30 days`);
        return deleteFiles(bucketName, objectsToDelete);
    }
    else {
        winston.info(`No artifacts older than 30 days to clean up`);
    }
}

/**
 * Creates an S3 bucket in the given region
 */
export async function createBucket(bucketName: string, region: string) {
    const createParams: AWS.S3.CreateBucketRequest = {
        Bucket: bucketName,
        ACL: 'private'
    };
    if (region !== 'us-east-1') { // If you specify us-east-1 it will fail (this is the default)
        createParams.CreateBucketConfiguration = {
            LocationConstraint: region
        };
    }
    winston.verbose(`Creating S3 bucket ${bucketName}`);
    const bucket = await awsWrapper.s3.createBucket(createParams);
    winston.verbose(`Created S3 bucket ${bucketName}`);
    return bucket;
}

/**
 * Gets information about the S3 bucket with the given name
 */
export async function getBucket(bucketName: string) {
    winston.verbose(`Getting S3 bucket ${bucketName}`);
    const listResponse = await awsWrapper.s3.listBuckets();
    const buckets = listResponse.Buckets!;
    for (const bucket of buckets) {
        if (bucket.Name === bucketName) {
            winston.verbose(`Found bucket ${bucketName}`);
            return bucket;
        }
    }
    winston.verbose(`Bucket ${bucketName} does not exist`);
    return null;
}

/**
 * Creates the S3 bucket with the given name and region, or just
 * returns the information about the bucket if it already exists
 */
export async function createBucketIfNotExists(bucketName: string, region: string) {
    const bucket = await getBucket(bucketName);
    if (bucket) {
        return bucket;
    }
    else {
        const createResponse = await createBucket(bucketName, region);
        return getBucket(bucketName);
    }
}
