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
import awsWrapper from './aws-wrapper';

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
