const AWS = require('aws-sdk');
const fs = require('fs');
const winston = require('winston');

exports.uploadFile = function(bucketName, key, filePath) {
    let s3 = new AWS.S3({apiVersion: '2006-03-01'});
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

exports.createBucket = function(bucketName, region) {
    let s3 = new AWS.S3({apiVersion: '2006-03-01'});
    var createParams = {
        Bucket: bucketName,
        ACL: 'private'
    };
    if(region !== 'us-east-1') { //If you specify us-east-1 it will fail (this is the default)
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


exports.getBucket = function(bucketName) {
    let s3 = new AWS.S3({apiVersion: '2006-03-01'});
    winston.debug(`Getting S3 bucket ${bucketName}`)
    return s3.listBuckets().promise()
        .then(listResponse => {
            let buckets = listResponse.Buckets;
            for(let bucket of buckets) {
                if(bucket.Name === bucketName) {
                    winston.debug(`Found bucket ${bucketName}`);
                    return bucket;
                }
            }
            winston.debug(`Bucket ${bucketName} does not exist`);
            return null;
        })
}

exports.createBucketIfNotExists = function(bucketName, region) {
    return exports.getBucket(bucketName)
        .then(bucket => {
            if(bucket) {
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