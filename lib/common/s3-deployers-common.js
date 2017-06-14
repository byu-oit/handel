const handlebarsUtils = require('./handlebars-utils');
const accountConfig = require('./account-config')().getAccountConfig();
const deployPhaseCommon = require('./deploy-phase-common');
const cloudFormationCalls = require('../aws/cloudformation-calls');

exports.createLoggingBucketIfNotExists = function() {
    let stackName = "HandelS3LoggingBucket";
    let bucketName = `handel-s3-bucket-logging-${accountConfig.region}-${accountConfig.account_id}`;
    let handlebarsParams = {
        bucketName
    }

    return handlebarsUtils.compileTemplate(`${__dirname}/s3-static-site-logging-bucket.yml`, handlebarsParams)
        .then(compiledTemplate => {
            return deployPhaseCommon.deployCloudFormationStack(stackName, compiledTemplate, [], false, "Logging Bucket for S3 Static Sites");
        })
        .then(deployedStack => {
            return cloudFormationCalls.getOutput("BucketName", deployedStack);
        });
}

exports.getLogFilePrefix = function(serviceContext) {
    return `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}/`;
}