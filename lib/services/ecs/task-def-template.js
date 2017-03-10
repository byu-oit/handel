let taskDefinition = {
    "containerDefinitions": [
        {
            "name": "",
            "image": "",
            "cpu": 0,
            "memory": 0,
            "memoryReservation": 0,
            "links": [
                ""
            ],
            "portMappings": [
                {
                    "containerPort": 0,
                    "hostPort": 0,
                    "protocol": ""
                }
            ],
            "essential": true,
            "entryPoint": [
                ""
            ],
            "command": [
                ""
            ],
            "environment": [
                {
                    "name": "",
                    "value": ""
                }
            ],
            "mountPoints": [
                {
                    "sourceVolume": "",
                    "containerPath": "",
                    "readOnly": true
                }
            ],
            "volumesFrom": [
                {
                    "sourceContainer": "",
                    "readOnly": true
                }
            ],
            "hostname": "",
            "user": "",
            "workingDirectory": "",
            "disableNetworking": true,
            "privileged": true,
            "readonlyRootFilesystem": true,
            "dnsServers": [
                ""
            ],
            "dnsSearchDomains": [
                ""
            ],
            "extraHosts": [
                {
                    "hostname": "",
                    "ipAddress": ""
                }
            ],
            "dockerSecurityOptions": [
                ""
            ],
            "dockerLabels": {
                "KeyName": ""
            },
            "ulimits": [
                {
                    "name": "",
                    "softLimit": 0,
                    "hardLimit": 0
                }
            ],
            "logConfiguration": {
                "logDriver": "",
                "options": {
                    "KeyName": ""
                }
            }
        }
    ],
    "placementConstraints": [
        {
            "expression": "",
            "type": "memberOf"
        }
    ],
    "volumes": [
        {
            "name": "",
            "host": {
                "sourcePath": ""
            }
        }
    ]
}

function getTaskDefEnvVarForObject(object) {
    let taskDefEnvVars = [];
    for(let envVarName in object) {
        taskDefEnvVars.push({
            "name": envVarName,
            "value": object[envVarName]
        });
    }
    return taskDefEnvVars;
}

function getTaskDefMountPointsForObject(obejct) {

}

function getDependenciesDeployContextEnvVars(dependenciesDeployContexts) {
    return dependenciesDeployContexts.map(function(deployContext) {
        return deployContext['outputs'];
    });
}

function getDependenciesDeployContextMountPoints(dependenciesDeployContexts) {
    return dependenciesDeployContexts.map(function(deployContext) {
        if(deployContext['serviceType'] === 'efs') {
            
        }
    });
}

exports.getTaskDefinition = function(serviceContext, dependenciesDeployContexts) {
    let ecsParams = serviceContext.params;
    let ecsName = `${serviceContext.appName}_${serviceContext.environmentName}_${serviceContext.serviceName}`
    let taskRoleArn = "TODO"; //TODO - Create custom role for task
    let imageName = `${ecsParams['image_name']}:${serviceContext['deployVersion']}`;

    let taskDefinition = {
        "family": ecsName,
        "taskRoleArn": taskRoleArn,
        "networkMode": "bridge",
        "containerDefinitions": [{
            "name": ecsName,
            "image": imageName,
            "memory": ecsParams['max_mb'],
            "cpu": ecsParams['cpu_units'],
            "essential": true,
            "portMappings": [], //Added dynamically below for multiple ports
            "environment": [], //Added dynamically below for multiple env vars
            "mountPoints": [] //Added dynamically below for multiple mount points
        }],
        "placementConstraints": [],
        "volumes": [], //Added dynamically below for multiple volumes
        "mountPoints": []
    }

    //Add port mappings to container definitions
    for(let portToMap of ecsParams['port_mappings']) {
        taskDefinition['containerDefinitions']['portMappings'].push({
            "containerPort": portToMap,
            "protocol": "tcp"
        });
    }

    let taskDefEnvVars = taskDefinition['containerDefinitions']['environment'];
    //Inject env vars defined by service
    taskDefEnvVars = taskDefEnvVars.concat(getTaskDefEnvVarForObject(ecsParams['environment_variables']));
    //Inject env vars from service dependencies
    let dependenciesEnvVars = getDependenciesDeployContextEnvVars(dependenciesDeployContexts);
    taskDefEnvVars = taskDefEnvVars.concat(getTaskDefEnvVarForObject(dependenciesEnvVars)); 


    //TODO - Add volumes and associated mount points defined by service

    //Add volumes and mount points from service dependencies
    let taskDefMountPoints = taskDefinition['containerDefinitions']['environment']
    taskDefMountPoints = taskDefMountPoints.concat(getTaskDefMountPointsForObject(dependencies))
    taskDefinition['containerDefinitions']['mountPoints'].push({
        "containerPath": "/mnt/share/repos-workspace",
        "sourceVolume": "efs",
        "readOnly": null
    })
                

    //Add container definitions

    //Add placement constraints

    //Add volumes


    return taskDefinition;
}