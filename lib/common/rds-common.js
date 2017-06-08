const cloudFormationCalls = require('../aws/cloudformation-calls');
const deployPhaseCommon = require('../common/deploy-phase-common');
const DeployContext = require('../datatypes/deploy-context');
const ssmCalls = require('../aws/ssm-calls');

exports.getDeployContext = function (serviceContext, rdsCfStack) {
    let deployContext = new DeployContext(serviceContext);

    //Inject ENV variables to talk to this database
    let portEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'ADDRESS');
    let port = cloudFormationCalls.getOutput('DatabaseAddress', rdsCfStack);
    deployContext.environmentVariables[portEnv] = port;
    let addressEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'PORT');
    let address = cloudFormationCalls.getOutput('DatabasePort', rdsCfStack);
    deployContext.environmentVariables[addressEnv] = address;
    let usernameEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'USERNAME');
    let username = cloudFormationCalls.getOutput('DatabaseUsername', rdsCfStack);
    deployContext.environmentVariables[usernameEnv] = username;
    let dbNameEnv = deployPhaseCommon.getInjectedEnvVarName(serviceContext, 'DATABASE_NAME');
    let dbName = cloudFormationCalls.getOutput('DatabaseName', rdsCfStack);
    deployContext.environmentVariables[dbNameEnv] = dbName;

    return deployContext;
}

exports.addDbCredentialToParameterStore = function (ownServiceContext, dbPassword, deployedStack) {
    //Add credential to EC2 Parameter Store
    let credentialParamName = deployPhaseCommon.getSsmParamName(ownServiceContext, "db_password");
    return ssmCalls.storeParameter(credentialParamName, 'SecureString', dbPassword)
        .then(() => {
            return deployedStack;
        });
}

exports.deleteParametersFromParameterStore = function (ownServiceContext, unDeployContext) {
    let paramsToDelete = [
        deployPhaseCommon.getSsmParamName(ownServiceContext, "db_password")
    ]
    return ssmCalls.deleteParameters(paramsToDelete)
        .then(() => {
            return unDeployContext;
        });
}