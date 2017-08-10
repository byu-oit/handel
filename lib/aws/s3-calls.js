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
const AWS = require('aws-sdk');
const fs = require('fs');
const winston = require('winston');
const childProcess = require('child_process');

function getObjectsToDelete(objects) {
    let objectsToDelete = [];

    //Sort by date
    objects.sort(function (a, b) {
        return b.LastModified.getTime() - a.LastModified.getTime();
    });

    //Always keep 5 most recent versions (no matter how old), then delete anything else older than 30 days
    if (objects.length > 5) {
        for (let i = 5; i < objects.length; i++) {
            let object = objects[i];
            let now = new Date();
            var diff = Math.abs(now.getTime() - object.LastModified.getTime());
            let daysOld = diff / (1000 * 60 * 60 * 24);
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
exports.deleteMatchingPrefix = function(bucketName,prefix)
{
  let s3 = new AWS.S3({ apiVersion: '2006-03-01' });
  winston.info(`Deleting service files from bucket ${bucketName} with prefix ${prefix}`);

  let parms = {
    Bucket: bucketName,
    Prefix: prefix
  };
  return s3.listObjectsV2(parms).promise()
    .then(data=>{
      winston.info('delete list',data);
      let parmDelete = {
        Bucket: data.Name,
        Delete: {
          Objects: [],
          Quiet: false
        }
      };
      for(let fl of data.Contents)
      {
        winston.debug(`Deleting service file ${fl.Key} from ${data.Name}`);
        parmDelete.Delete.Objects.push({Key:fl.Key});
      }
      return parmDelete;
    })
    .then(parm=>{
      return s3.deleteObjects(parm).promise()
      .then(rc=>{
        winston.debug('Delete results',rc);
        return rc;
      });
    })
    .catch(err=>{
      winston.debug('Delete s3 artifacts warning',err+"".split("\n")[0]);
      return null;
    });
};



/**
 * Uploads the given file to a bucket with the given key
 */
exports.uploadFile = function (bucketName, key, filePath) {
    let s3 = new AWS.S3({ apiVersion: '2006-03-01' });
    let fileStream = fs.createReadStream(filePath);

    let uploadParams = {
        Bucket: bucketName,
        Key: key,
        Body: fileStream
    }

    winston.debug(`Uploading file ${filePath} to ${bucketName}/${key}`);
    return s3.upload(uploadParams).promise()
        .then(uploadResponse => {
            winston.debug(`Uploaded file ${filePath} to ${bucketName}/${key}`);
            return uploadResponse;
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
exports.uploadDirectory = function (bucketName, keyPrefix, dirToUpload) {
    return new Promise((resolve, reject) => {
        let cmd = `aws s3 sync ${dirToUpload} s3://${bucketName}/${keyPrefix} --delete`
        childProcess.exec(cmd, function (err, stdout, stderr) {
            if (!err) {
                resolve(true);
            }
            else {
                if(err.message.includes("command not found")) {
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
exports.listFilesByPrefix = function (bucketName, keyPrefix) {
    let s3 = new AWS.S3({ apiVersion: '2006-03-01' });

    var listParams = {
        Bucket: bucketName,
        MaxKeys: 1000,
        Prefix: keyPrefix,
    };

    return s3.listObjectsV2(listParams).promise()
        .then(listResponse => {
            let objects = [];
            if (listResponse.Contents) {
                objects = listResponse.Contents;
            }
            return objects;
        });
}

/**
 * Deletes the given objects from the S3 bucket
 */
exports.deleteFiles = function (bucketName, objects) {
    let s3 = new AWS.S3({ apiVersion: '2006-03-01' });

    let objectsToDelete = [];
    for (let object of objects) {
        objectsToDelete.push({
            Key: object.Key
        });
    }

    var deleteParams = {
        Bucket: bucketName,
        Delete: {
            Objects: objectsToDelete,
            Quiet: true
        }
    };
    return s3.deleteObjects(deleteParams).promise();
}

/**
 * Cleans up all objects in a bucket with a certain key prefix that are
 * older than 30 days. 
 * 
 * This method keeps at least the 5 most recent objects, no matter how
 * old they are.
 */
exports.cleanupOldVersionsOfFiles = function (bucketName, keyPrefix) {
    return exports.listFilesByPrefix(bucketName, keyPrefix)
        .then(objects => {
            let objectsToDelete = getObjectsToDelete(objects);
            if (objectsToDelete.length > 0) {
                winston.info(`Deleting ${objectsToDelete.length} old versions older than 30 days`);
                return exports.deleteFiles(bucketName, objectsToDelete);
            }
            else {
                winston.info(`No artifacts older than 30 days to clean up`);
            }
        });
}

/**
 * Creates an S3 bucket in the given region
 */
exports.createBucket = function (bucketName, region) {
    let s3 = new AWS.S3({ apiVersion: '2006-03-01' });
    var createParams = {
        Bucket: bucketName,
        ACL: 'private'
    };
    if (region !== 'us-east-1') { //If you specify us-east-1 it will fail (this is the default)
        createParams.CreateBucketConfiguration = {
            LocationConstraint: region
        }
    }
    winston.debug(`Creating S3 bucket ${bucketName}`);
    return s3.createBucket(createParams).promise()
        .then(bucket => {
            winston.debug(`Created S3 bucket ${bucketName}`);
            return bucket;
        });
}


/**
 * Gets information about the S3 bucket with the given name
 */
exports.getBucket = function (bucketName) {
    let s3 = new AWS.S3({ apiVersion: '2006-03-01' });
    winston.debug(`Getting S3 bucket ${bucketName}`)
    return s3.listBuckets().promise()
        .then(listResponse => {
            let buckets = listResponse.Buckets;
            for (let bucket of buckets) {
                if (bucket.Name === bucketName) {
                    winston.debug(`Found bucket ${bucketName}`);
                    return bucket;
                }
            }
            winston.debug(`Bucket ${bucketName} does not exist`);
            return null;
        })
}

/**
 * Creates the S3 bucket with the given name and region, or just
 * returns the information about the bucket if it already exists
 */
exports.createBucketIfNotExists = function (bucketName, region) {
    return exports.getBucket(bucketName)
        .then(bucket => {
            if (bucket) {
                return bucket;
            }
            else {
                return exports.createBucket(bucketName, region)
                    .then(createResponse => {
                        return exports.getBucket(bucketName);
                    });
            }
        });
}
