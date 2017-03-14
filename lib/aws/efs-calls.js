const util = require('../util/util');
const winston = require('winston');
const AWS = require('aws-sdk');
const efs = new AWS.EFS({
    apiVersion: '2015-02-01'
});
const EFS_POLL_TIME_MS = 15000; //5 seconds

function waitForFileSystemToBeAvailable(creationToken) {
    const deferred = {};
    deferred.promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    function getFileSystem() {
        winston.info(`Waiting for EFS file system ${creationToken} to be available`);
        setTimeout(function() {
            exports.getFileSystem(creationToken)
                .then(fileSystem => {
                    if(fileSystem['LifeCycleState'] === 'available') {
                        deferred.resolve(fileSystem);
                    }
                    else {
                        //TODO - Implement wait timeout
                        getFileSystem();
                    }
                });
        }, EFS_POLL_TIME_MS);
    }
    getFileSystem();

    return deferred.promise;
}

function getMountTarget(mountTargetId) {
    var getMountTargetParams = {
        MountTargetId: mountTargetId
    };
    return efs.describeMountTargets(getMountTargetParams).promise()
        .then(describeResult => {
            return describeResult['MountTargets'][0];
        }) 
}

function waitForMountTargetToBeAvailable(mountTargetId) {
    const deferred = {};
    deferred.promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    function checkMountTargets() {
        winston.info(`Waiting for EFS mount target ${mountTargetId} to be available`);
        setTimeout(function() {
            getMountTarget(mountTargetId)
                .then(mountTarget => {
                    if(mountTarget['LifeCycleState'] === 'available') {
                        deferred.resolve(mountTarget);
                    }
                    else {
                        //TODO - Implement wait timeout
                        checkMountTargets(); //Keep waiting
                    }
                });
        }, EFS_POLL_TIME_MS);
    }
    checkMountTargets();

    return deferred.promise;
}

function waitForMountTargetsToBeAvailable(mountTargets) {
    let mountTargetWaitPromises = [];

    for(let mountTarget of mountTargets) {
        mountTargetWaitPromises.push(waitForMountTargetToBeAvailable(mountTarget['MountTargetId']));
    }

    return Promise.all(mountTargetWaitPromises);
}

function createMountTargets(creationToken, fileSystemId, subnetIds, securityGroup) {
    var createMountTargetPromises = [];

    for(let subnetId of subnetIds) {
        let createMountTargetParams = {
            FileSystemId: fileSystemId,
            SubnetId: subnetId,
            SecurityGroups: [securityGroup]
        }
        let createMountTargetPromise = efs.createMountTarget(createMountTargetParams).promise()
        createMountTargetPromises.push(createMountTargetPromise);
    }

    return Promise.all(createMountTargetPromises)
        .then(mountTargets => {
            return waitForMountTargetsToBeAvailable(mountTargets)
                .then(() => {
                    return exports.getFileSystem(creationToken);
                });
        });
}

function createTags(fileSystemId, creationToken) {
    var createTagsParams = {
        FileSystemId: fileSystemId,
        Tags: [
            {
                Key: "Name",
                Value: creationToken
            }
        ]
    };
    return efs.createTags(createTagsParams).promise();
}

/**
 * Gets the file system by creation token if it exists
 * 
 * @param {String} creationToken - The creation token of the file system to get 
 * @return {FileSystem} - The found FileSystem, or null if none was found
 */
exports.getFileSystem = function(creationToken) {
    var describeFileSystemsParams = {
        CreationToken: creationToken
    };
    return efs.describeFileSystems(describeFileSystemsParams).promise()
        .then(describeResults => {
            if(describeResults['FileSystems'].length === 0) {
                return null;
            }
            else {
                return describeResults['FileSystems'][0]
            }
        });
}


/**
 * Create a file system using the given file system name (creation token)
 * 
 * @param {String} creationToken - The creation token to use when creating the file system.
 * @param {String} performanceMode - "generalPurpose" or "maxIO"
 * @param {Array<String>} subnetIds - A list of the subnet IDs where mount targets should be created
 * @param {SecurityGroup} securityGroup - The AWS security group to attach to this file system
 * @returns {FileSystem} - The created FileSystem
 */
exports.createFileSystem = function(creationToken, performanceMode, subnetIds, securityGroup) {
    var createFileSystemParams = {
        CreationToken: creationToken,
        PerformanceMode: performanceMode
    };
    return efs.createFileSystem(createFileSystemParams).promise()
        .then(createFileSystemResult => {
            return waitForFileSystemToBeAvailable(creationToken)
        })
        .then(fileSystem => {
            return createTags(fileSystem['FileSystemId'], creationToken)
                .then(() => {
                    return fileSystem;
                })
        })
        .then(fileSystem => {
            return createMountTargets(creationToken, fileSystem["FileSystemId"], subnetIds, securityGroup['GroupId']);
        });
}