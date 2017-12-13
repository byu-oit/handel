const deployPhaseCommon = require('./deploy-phase-common');

function getDependenciesDeployContextMountPoints(dependenciesDeployContexts) {
    let mountPoints = [];
    for (let deployContext of dependenciesDeployContexts) {
        if (deployContext['serviceType'] === 'efs') { //Only EFS is supported as an external service mount point for now
            let envVarKey = deployPhaseCommon.getInjectedEnvVarName(deployContext, 'MOUNT_DIR');

            mountPoints.push({
                mountDir: deployContext.environmentVariables[envVarKey],
                name: envVarKey
            });
        }
    }
    return mountPoints;
}

exports.getVolumes = function(dependenciesDeployContexts) {
    let volumes = null;
    let dependenciesMountPoints = getDependenciesDeployContextMountPoints(dependenciesDeployContexts);
    if (Object.keys(dependenciesMountPoints).length > 0) {
        volumes = [];

        for (let taskDefMountPoint of dependenciesMountPoints) {
            volumes.push({
                sourcePath: taskDefMountPoint.mountDir,
                name: taskDefMountPoint.name
            });
        }
    }
    return volumes;
}

exports.getMountPointsForContainer = function(dependenciesDeployContexts) {
    let mountPoints = null;
    let dependenciesMountPoints = getDependenciesDeployContextMountPoints(dependenciesDeployContexts);
    if (Object.keys(dependenciesMountPoints).length > 0) {
        mountPoints = [];

        for (let taskDefMountPoint of dependenciesMountPoints) {
            mountPoints.push({
                containerPath: taskDefMountPoint.mountDir,
                sourceVolume: taskDefMountPoint.name
            });
        }
    }
    return mountPoints;
}