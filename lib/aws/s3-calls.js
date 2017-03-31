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
    return s3.upload(uploadParams).promise()
        .then(uploadResponse => {
            return uploadResponse;
        })
}

exports.createBucket = function(bucketName, region) {
    let s3 = new AWS.S3({apiVersion: '2006-03-01'});
    winston.info(`Creating S3 bucket ${bucketName}`);
    var createParams = {
        Bucket: bucketName,
        ACL: 'private',
        CreateBucketConfiguration: {
            LocationConstraint: region
        }
    };
    return s3.createBucket(createParams).promise()
        .then(bucket => {
            winston.info(`Created S3 bucket ${bucketName}`);
            return bucket;
        });
}


exports.getBucket = function(bucketName) {
    let s3 = new AWS.S3({apiVersion: '2006-03-01'});
    winston.info(`Getting S3 bucket ${bucketName}`)
    return s3.listBuckets().promise()
        .then(listResponse => {
            let buckets = listResponse.Buckets;
            for(let bucket of buckets) {
                if(bucket.Name === bucketName) {
                    return bucket;
                }
            }
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