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
import { Tags } from 'handel-extension-api';
import * as awsTags from './aws-tags';
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
export async function deleteMatchingPrefix(bucketName: string, prefix: string): Promise<AWS.S3.DeleteObjectOutput | null> {
    const listObjectsParams = {
        Bucket: bucketName,
        Prefix: prefix
    };
    try {
        const listObjectsResponse = await awsWrapper.s3.listObjectsV2(listObjectsParams);
        const deleteObjectsParams: AWS.S3.DeleteObjectsRequest = {
            Bucket: listObjectsResponse.Name!,
            Delete: {
                Objects: [],
                Quiet: false
            }
        };
        for (const fl of listObjectsResponse.Contents!) {
            deleteObjectsParams.Delete.Objects.push({
                Key: fl.Key!
            });
        }
        if (deleteObjectsParams.Delete.Objects.length === 0) {
            return null;
        }
        const deleteObjectsResponse = await awsWrapper.s3.deleteObjects(deleteObjectsParams);
        return deleteObjectsResponse;
    }
    catch (err) {
        // tslint:disable-next-line:no-console
        console.error(err);
        return null;
    }
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
export async function listFilesByPrefix(bucketName: string, keyPrefix: string): Promise<AWS.S3.Object[]> {
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
export function deleteFiles(bucketName: string, objects: AWS.S3.Object[]): Promise<AWS.S3.DeleteObjectsOutput> {
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
export async function cleanupOldVersionsOfFiles(bucketName: string, keyPrefix: string): Promise<AWS.S3.DeleteObjectsOutput | undefined> {
    const objects = await listFilesByPrefix(bucketName, keyPrefix);
    const objectsToDelete = getObjectsToDelete(objects);
    if (objectsToDelete.length > 0) {
        return deleteFiles(bucketName, objectsToDelete);
    }
}

/**
 * Uploads the given file to a bucket with the given key
 */
export async function uploadFile(bucketName: string, key: string, filePath: string): Promise<AWS.S3.ManagedUpload.SendData> {
    const fileStream = fs.createReadStream(filePath);

    const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: bucketName,
        Key: key,
        Body: fileStream
    };

    const uploadResponse = await awsWrapper.s3.upload(uploadParams);
    return uploadResponse;
}

export async function uploadString(bucketName: string, key: string, content: string): Promise<AWS.S3.ManagedUpload.SendData> {
    const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: bucketName,
        Key: key,
        Body: Buffer.from(content, 'binary')
    };

    const uploadResponse = await awsWrapper.s3.upload(uploadParams);
    return uploadResponse;
}

/**
 * Creates an S3 bucket in the given region
 */
export async function createBucket(bucketName: string, region: string, tags?: Tags | null): Promise<AWS.S3.CreateBucketOutput> {
    const createParams: AWS.S3.CreateBucketRequest = {
        Bucket: bucketName,
        ACL: 'private'
    };
    if (region !== 'us-east-1') { // If you specify us-east-1 it will fail (this is the default)
        createParams.CreateBucketConfiguration = {
            LocationConstraint: region
        };
    }
    const bucket = await awsWrapper.s3.createBucket(createParams);
    if (tags && Object.getOwnPropertyNames(tags).length > 0) {
        await awsWrapper.s3.putBucketTagging({
            Bucket: bucketName,
            Tagging: {
                TagSet: awsTags.toAWSTagStyle(tags)
            }
        });
    }
    return bucket;
}

/**
 * Gets information about the S3 bucket with the given name
 */
export async function getBucket(bucketName: string): Promise<AWS.S3.Bucket | null> {
    const listResponse = await awsWrapper.s3.listBuckets();
    const buckets = listResponse.Buckets!;
    for (const bucket of buckets) {
        if (bucket.Name === bucketName) {
            return bucket;
        }
    }
    return null;
}

/**
 * Creates the S3 bucket with the given name and region, or just
 * returns the information about the bucket if it already exists
 */
export async function createBucketIfNotExists(bucketName: string, region: string, tags?: Tags | null): Promise<AWS.S3.Bucket | null> {
    const bucket = await getBucket(bucketName);
    if (bucket) {
        return bucket;
    }
    else {
        const createResponse = await createBucket(bucketName, region, tags || {});
        return getBucket(bucketName);
    }
}
