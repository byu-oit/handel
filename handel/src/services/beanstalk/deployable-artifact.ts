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
import * as fs from 'fs';
import { AccountConfig, ServiceConfig, ServiceContext } from 'handel-extension-api';
import * as extensionSupport from 'handel-extension-support';
import * as os from 'os';
import * as path from 'path';
import * as uuid from 'uuid';
import * as winston from 'winston';
import * as util from '../../common/util';
import { BeanstalkServiceConfig, EbextensionsToInject } from './config-types';
import * as ebextensions from './ebextensions';

async function zipDir(dirPath: string): Promise<string> {
  const zippedPath = `${os.tmpdir()}/${uuid()}.zip`;
  await extensionSupport.util.zipDirectoryToFile(dirPath, zippedPath);
  return zippedPath;
}

function replaceTagsInDockerRunFile(fileName: string, tempDirPath: string, ownServiceContext: ServiceContext<ServiceConfig>, accountConfig: AccountConfig) {
  const tagsToReplace = [
    { regex: /\<aws_account_id\>/g, value: accountConfig.account_id },
    { regex: /\<aws_region\>/g, value: accountConfig.region },
    { regex: /\<handel_app_name\>/g, value: ownServiceContext.appName },
    { regex: /\<handel_environment_name\>/g, value: ownServiceContext.environmentName },
    { regex: /\<handel_service_name\>/g, value: ownServiceContext.serviceName }
  ];
  util.replaceTagInFile(tagsToReplace, tempDirPath, fileName);
}

function replaceTagsInDockerRunDir(tempDirPath: string, ownServiceContext: ServiceContext<ServiceConfig>, accountConfig: AccountConfig) {
  const tagsToReplace = [
    { regex: /\<aws_account_id\>/g, value: accountConfig.account_id },
    { regex: /\<aws_region\>/g, value: accountConfig.region },
    { regex: /\<handel_app_name\>/g, value: ownServiceContext.appName },
    { regex: /\<handel_environment_name\>/g, value: ownServiceContext.environmentName },
    { regex: /\<handel_service_name\>/g, value: ownServiceContext.serviceName }
  ];
  const directoryListing = util.readDirSync(tempDirPath);
  if (directoryListing) {
    winston.debug(`Directory ${tempDirPath} Zip contains:`);
    for (const directoryFile of directoryListing) {
      winston.debug(`+ ${directoryFile}`);
      if (directoryFile !== 'Dockerrun.aws.json') {
        continue;
      }

      const dockerrunContents = util.replaceTagInFile(tagsToReplace, tempDirPath, directoryFile);
      if (dockerrunContents) {
        winston.debug('Dockerrun.aws.json contents:', '\n' + dockerrunContents);
      }
      else {
        throw Error('Unable to do tag replacement in Dockerrun.aws.json');
      }
    }
  }
}

async function uploadDeployableArtifactToS3(serviceContext: ServiceContext<ServiceConfig>, fileToUpload: string, fileExtension: string): Promise<AWS.S3.ManagedUpload.SendData> {
  const s3FileName = `beanstalk-deployable-${uuid()}.${fileExtension}`;
  winston.info(`Uploading deployable artifact to S3: ${s3FileName}`);
  const artifactPrefix = `${serviceContext.appName}/${serviceContext.environmentName}/${serviceContext.serviceName}`;
  const s3ObjectInfo = await extensionSupport.deployPhase.uploadFileToHandelBucket(fileToUpload, artifactPrefix, s3FileName, serviceContext.accountConfig);
  winston.info(`Uploaded deployable artifact to S3: ${s3FileName}`);
  return s3ObjectInfo;
}

async function prepareAndUploadDir(ownServiceContext: ServiceContext<ServiceConfig>, pathToArtifact: string, ebextensionsToInject: EbextensionsToInject): Promise<AWS.S3.ManagedUpload.SendData> {
  const accountConfig = ownServiceContext.accountConfig;

  const tempDirPath = util.makeTmpDir();
  await util.copyDirectory(pathToArtifact, tempDirPath);
  replaceTagsInDockerRunDir(tempDirPath, ownServiceContext, accountConfig);
  ebextensions.addEbextensionsToDir(ebextensionsToInject, tempDirPath);
  const fileToUpload = await zipDir(tempDirPath);
  const fileExtension = 'zip';
  const s3ArtifactInfo = await uploadDeployableArtifactToS3(ownServiceContext, fileToUpload, fileExtension);
  fs.unlinkSync(fileToUpload); // Delete temp zip file
  util.deleteFolderRecursive(tempDirPath); // Delete the whole temp folder
  return s3ArtifactInfo;
}

async function prepareAndUploadFile(ownServiceContext: ServiceContext<ServiceConfig>, pathToArtifact: string, ebextensionsToInject: EbextensionsToInject, fileName: string) {
  const accountConfig = ownServiceContext.accountConfig;

  const absArtifactPath = path.resolve(pathToArtifact);
  const artifactDir = path.dirname(absArtifactPath);

  // Copy file to upload to a temp dir (so that we can also include ebextensions if applicable)
  const tempDirPath = util.makeTmpDir();
  winston.debug('Copy to', tempDirPath, 'file', '\n' + JSON.stringify(pathToArtifact, null, 2));
  await util.copyFile(pathToArtifact, `${tempDirPath}/${fileName}`);

  // Prepare Ebextensions if present
  const userEbextensionsDir = `${artifactDir}/.ebextensions/`;
  if (fs.existsSync(userEbextensionsDir)) {
    await util.copyDirectory(userEbextensionsDir, `${tempDirPath}/.ebextensions/`);
  }
  ebextensions.addEbextensionsToDir(ebextensionsToInject, tempDirPath);

  // Replace tags in file if this is a  Dockerrun.aws.json file we're uploading
  if (fileName === 'Dockerrun.aws.json') {
    replaceTagsInDockerRunFile(fileName, tempDirPath, ownServiceContext, accountConfig);
  }

  // Zip and upload the directory to S3
  const fileToUpload = await zipDir(tempDirPath);
  const fileExtension = 'zip';
  const s3ArtifactInfo = await uploadDeployableArtifactToS3(ownServiceContext, fileToUpload, fileExtension);

  // Delete the temporary folder and zipped file
  fs.unlinkSync(fileToUpload); // Delete temp zip file and temp dir
  util.deleteFolderRecursive(tempDirPath); // Delete the whole temp folder
  return s3ArtifactInfo;
}

async function prepareAndUploadWar(ownServiceContext: ServiceContext<ServiceConfig>, pathToArtifact: string, ebextensionsToInject: EbextensionsToInject): Promise<AWS.S3.ManagedUpload.SendData> {
  // NOTE: THIS CAN BE HANDLED EXACTLY THE SAME WAY AS JAR AND ZIP

  // Copy WAR to new temp one
  // Open up WAR (unzip), inject ebextensions
  // Re-zip dir to new temp WAR
  // Delete temp war
  throw new Error('Not Implemented');
}

function prepareAndUploadJar(ownServiceContext: ServiceContext<ServiceConfig>, pathToArtifact: string, ebextensionsToInject: EbextensionsToInject): Promise<AWS.S3.ManagedUpload.SendData> {
  const absArtifactPath = path.resolve(pathToArtifact);
  const fileName = path.basename(absArtifactPath);
  return prepareAndUploadFile(ownServiceContext, pathToArtifact, ebextensionsToInject, fileName);
}

function prepareAndUploadZip(ownServiceContext: ServiceContext<ServiceConfig>, pathToArtifact: string, ebextensionsToInject: EbextensionsToInject): Promise<AWS.S3.ManagedUpload.SendData> {
  // NOTE: THIS CAN BE HANDLED EXACTLY THE SAME WAY AS JAR AND WAR

  // Copy zip to temp one
  // Open up zip, inject ebextensions (if any)
  // Upload temp zip
  // Delete temp zip
  throw new Error('Not Implemented');
}

function prepareAndUploadDockerrun(ownServiceContext: ServiceContext<ServiceConfig>, pathToArtifact: string, ebextensionsToInject: EbextensionsToInject): Promise<AWS.S3.ManagedUpload.SendData> {
  return prepareAndUploadFile(ownServiceContext, pathToArtifact, ebextensionsToInject, 'Dockerrun.aws.json');
}

function prepareAndUploadMisc(ownServiceContext: ServiceContext<ServiceConfig>, pathToArtifact: string, ebextensionsToInject: EbextensionsToInject): Promise<AWS.S3.ManagedUpload.SendData> {
  const absArtifactPath = path.resolve(pathToArtifact);
  const fileName = path.basename(absArtifactPath);
  return prepareAndUploadFile(ownServiceContext, pathToArtifact, ebextensionsToInject, fileName);
}

export async function prepareAndUploadDeployableArtifact(ownServiceContext: ServiceContext<BeanstalkServiceConfig>, ebextensionsToInject: EbextensionsToInject): Promise<AWS.S3.ManagedUpload.SendData> {
  const pathToArtifact = ownServiceContext.params.path_to_code;
  const lowerArchivePath = pathToArtifact.toLowerCase();
  const fileStats = fs.lstatSync(pathToArtifact);
  if (fileStats.isDirectory()) { // Dir to upload (zip it up)
    return prepareAndUploadDir(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else if (lowerArchivePath.endsWith('.war')) { // Java WAR file
    return prepareAndUploadWar(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else if (lowerArchivePath.endsWith('.jar')) { // Java JAR file
    return prepareAndUploadJar(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else if (lowerArchivePath.endsWith('.zip')) { // User-managed ZIP file (send up as-is)
    return prepareAndUploadZip(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else if (pathToArtifact.endsWith('Dockerrun.aws.json')) { // Docker to zip up
    return prepareAndUploadDockerrun(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
  else { // Anything else (Go executable, etc. Zip it up)
    return prepareAndUploadMisc(ownServiceContext, pathToArtifact, ebextensionsToInject);
  }
}
