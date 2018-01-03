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
const fs = require('fs');
const ebextensions = require('./ebextensions');
const winston = require('winston');
const uuid = require('uuid');
const util = require('../../common/util');
const os = require('os');
const deployPhaseCommon = require('../../common/deploy-phase-common');
const path = require('path');


function zipDir(dirPath) {
  let zippedPath = `${os.tmpdir()}/${uuid()}.zip`;
  return util.zipDirectoryToFile(dirPath, zippedPath)
    .then(() => {
      return zippedPath;
    });
}

function makeTmpDir() {
  let tempDirPath = `${os.tmpdir()}/${uuid()}`;
  fs.mkdirSync(tempDirPath);
  return tempDirPath;
}



function uploadDeployableArtifactToS3(serviceContext, fileToUpload, fileExtension) {
  let s3FileName = `beanstalk-deployable-${uuid()}.${fileExtension}`;
  winston.info(`Uploading deployable artifact to S3: ${s3FileName}`);
  let artifactPrefix = `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}`;
  return deployPhaseCommon.uploadFileToHandelBucket(fileToUpload, artifactPrefix, s3FileName, serviceContext.accountConfig)
    .then(s3ObjectInfo => {
      winston.info(`Uploaded deployable artifact to S3: ${s3FileName}`);
      return s3ObjectInfo;
    });
}

function prepareAndUploadDir(ownServiceContext, pathToArtifact, ebextensionsToInject) {
  let accountConfig = ownServiceContext.accountConfig;

  let tempDirPath = makeTmpDir();
  return util.copyDirectory(pathToArtifact, tempDirPath)
    .then(() => {
      // replace tags in Dockerrun.aws.json if found
      let lstTag =
        [
          { regex: /\<aws_account_id\>/g, value: accountConfig.account_id },
          { regex: /\<aws_region\>/g, value: accountConfig.region },
          { regex: /\<handel_app_name\>/g, value: ownServiceContext.appName },
          { regex: /\<handel_environment_name\>/g, value: ownServiceContext.environmentName },
          { regex: /\<handel_service_name\>/g, value: ownServiceContext.serviceName }
        ];
      let lstDir = util.readDirSync(tempDirPath);
      if (lstDir) {
        winston.debug(`Directory ${tempDirPath} Zip contains:`);
        for (let fl of lstDir) {
          winston.debug(`+ ${fl}`);
          if (fl != "Dockerrun.aws.json") {
            continue
          }

          let rc = util.replaceTagInFile(lstTag, tempDirPath, fl);
          if (rc) {
            winston.debug('Dockerrun.aws.json contents:', '\n' + rc)
          }
          else {
            throw Error('Unable to do tag replacement in Dockerrun.aws.json')
          }
        }
      }
    }).then(() => {
      ebextensions.addEbextensionsToDir(ebextensionsToInject, tempDirPath);
      return zipDir(tempDirPath)
        .then(fileToUpload => {
          let fileExtension = 'zip';
          return uploadDeployableArtifactToS3(ownServiceContext, fileToUpload, fileExtension)
            .then(s3ArtifactInfo => {
              //Delete temp zip file
              fs.unlinkSync(fileToUpload);
              return s3ArtifactInfo;
            });
        })
        .then(s3ArtifactInfo => {
          util.deleteFolderRecursive(tempDirPath); //Delete the whole temp folder
          return s3ArtifactInfo;
        });
    });
}

//TODO - This is rather ugly code...
function prepareAndUploadFile(ownServiceContext, pathToArtifact, ebextensionsToInject, fileName) {
  let accountConfig = ownServiceContext.accountConfig;

  let absArtifactPath = path.resolve(pathToArtifact);
  let artifactDir = path.dirname(absArtifactPath);

  let tempDirPath = makeTmpDir();
  winston.debug('Copy to', tempDirPath, 'file', '\n' + JSON.stringify(pathToArtifact, null, 2));
  return util.copyFile(pathToArtifact, `${tempDirPath}/${fileName}`)
    .then(() => {
      let userEbextensionsDir = `${artifactDir}/.ebextensions/`;
      if (fs.existsSync(userEbextensionsDir)) {
        return util.copyDirectory(userEbextensionsDir, `${tempDirPath}/.ebextensions/`);
      }
      else {
        return true;
      }
    }).then(() => {
      if (fileName == "Dockerrun.aws.json") {
        let lstTag =
          [
            { regex: /\<aws_account_id\>/g, value: accountConfig.account_id },
            { regex: /\<aws_region\>/g, value: accountConfig.region },
            { regex: /\<handel_app_name\>/g, value: ownServiceContext.appName },
            { regex: /\<handel_environment_name\>/g, value: ownServiceContext.environmentName },
            { regex: /\<handel_service_name\>/g, value: ownServiceContext.serviceName }
          ];
        util.replaceTagInFile(lstTag, tempDirPath, fileName);
      }
      ebextensions.addEbextensionsToDir(ebextensionsToInject, tempDirPath)
      return zipDir(tempDirPath)
    }).then(fileToUpload => {
      let fileExtension = 'zip';
      return uploadDeployableArtifactToS3(ownServiceContext, fileToUpload, fileExtension)
        .then(s3ArtifactInfo => {
          //Delete temp zip file and temp dir
          fs.unlinkSync(fileToUpload);
          return s3ArtifactInfo;
        });
    }).then(s3ArtifactInfo => {
      util.deleteFolderRecursive(tempDirPath); //Delete the whole temp folder
      return s3ArtifactInfo;
    });
}

function prepareAndUploadWar(pathToArtifact, ebextensionsToInject) {
  //NOTE: THIS CAN BE HANDLED EXACTLY THE SAME WAY AS JAR AND ZIP

  //Copy WAR to new temp one
  //Open up WAR (unzip), inject ebextensions
  //Re-zip dir to new temp WAR
  //Delete temp war
  return Promise.reject(new Error("Not Implemented"));
}

function prepareAndUploadJar(ownServiceContext, pathToArtifact, ebextensionsToInject) {
  let absArtifactPath = path.resolve(pathToArtifact);
  let fileName = path.basename(absArtifactPath);
  return prepareAndUploadFile(ownServiceContext, pathToArtifact, ebextensionsToInject, fileName);
}

function prepareAndUploadZip(ownServiceContext, pathToArtifact, ebextensionsToInject) {
  //NOTE: THIS CAN BE HANDLED EXACTLY THE SAME WAY AS JAR AND WAR

  //Copy zip to temp one
  //Open up zip, inject ebextensions (if any)
  //Upload temp zip
  //Delete temp zip
  return Promise.reject(new Error("Not Implemented"));
}

function prepareAndUploadDockerrun(ownServiceContext, pathToArtifact, ebextensionsToInject, fileName) {
  return prepareAndUploadFile(ownServiceContext, pathToArtifact, ebextensionsToInject, "Dockerrun.aws.json")
}

function prepareAndUploadMisc(ownServiceContext, pathToArtifact, ebextensionsToInject) {
  let absArtifactPath = path.resolve(pathToArtifact);
  let fileName = path.basename(absArtifactPath);
  return prepareAndUploadFile(ownServiceContext, pathToArtifact, ebextensionsToInject, fileName)
}

exports.prepareAndUploadDeployableArtifact = function (ownServiceContext, ebextensionsToInject) {
  let pathToArtifact = ownServiceContext.params.path_to_code;
  let lowerArchivePath = pathToArtifact.toLowerCase();
  let fileStats = fs.lstatSync(pathToArtifact);
  if (fileStats.isDirectory()) { //Dir to upload (zip it up)
    return prepareAndUploadDir(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else if (lowerArchivePath.endsWith('.war')) { //Java WAR file
    return prepareAndUploadWar(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else if (lowerArchivePath.endsWith('.jar')) { //Java JAR file
    return prepareAndUploadJar(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else if (lowerArchivePath.endsWith('.zip')) { //User-managed ZIP file (send up as-is)
    return prepareAndUploadZip(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else if (pathToArtifact.endsWith('Dockerrun.aws.json')) { //Docker to zip up
    return prepareAndUploadDockerrun(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else { //Anything else (Go executable, etc. Zip it up)
    return prepareAndUploadMisc(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
}
