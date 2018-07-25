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
import { DeployContext, ServiceContext } from 'handel-extension-api';
import { deployPhase, handlebars } from 'handel-extension-support';
import * as uuid from 'uuid';
import * as winston from 'winston';
import * as util from '../../common/util';
import { CodeDeployServiceConfig } from './config-types';

async function injectEnvVarsIntoAppSpec(dirPath: string, serviceContext: ServiceContext<CodeDeployServiceConfig>, dependenciesDeployContexts: DeployContext[]): Promise<void> {
    const pathToAppSpec = `${dirPath}/appspec.yml`;
    const appSpecFile = util.readYamlFileSync(pathToAppSpec);
    if(appSpecFile.hooks) { // There are hooks to be enriched with env vars
        for(const hookName in appSpecFile.hooks) {
            if(appSpecFile.hooks.hasOwnProperty(hookName)) {
                const hookDefinition = appSpecFile.hooks[hookName];
                for(let i = 0; i < hookDefinition.length; i++) {
                    const eventMapping = hookDefinition[i];

                    // Write wrapper script to upload directory
                    const handlebarsParams = {
                        originalScriptLocation: eventMapping.location,
                        envVarsToInject: deployPhase.getEnvVarsForDeployedService(serviceContext, dependenciesDeployContexts, serviceContext.params.environment_variables)
                    };
                    const compiledTemplate = await handlebars.compileTemplate(`${__dirname}/env-var-inject-template.handlebars`, handlebarsParams);
                    const wrapperScriptLocation = `handel-wrapper-${hookName}-${i}.sh`;
                    util.writeFileSync(`${dirPath}/${wrapperScriptLocation}`, compiledTemplate);

                    // Modify the appspec.yml entry to invoke our wrapper
                    eventMapping.location = wrapperScriptLocation;
                }
            }
        }

        // Save our modified appspec file to overwrite the user-provided one
        util.writeFileSync(pathToAppSpec, JSON.stringify(appSpecFile));
    }
}

async function enrichUploadDir(dirPath: string, serviceContext: ServiceContext<CodeDeployServiceConfig>, dependenciesDeployContexts: DeployContext[]): Promise<void> {
    await injectEnvVarsIntoAppSpec(dirPath, serviceContext, dependenciesDeployContexts);
}

export async function prepareAndUploadDeployableArtifactToS3(serviceContext: ServiceContext<CodeDeployServiceConfig>, dependenciesDeployContexts: DeployContext[], serviceName: string): Promise<AWS.S3.ManagedUpload.SendData> {
    const params = serviceContext.params;

    // We copy to a temporary directory so we can enrich it with Handel-added files for things like environment variables
    const tempDirPath = util.makeTmpDir();
    await util.copyDirectory(params.path_to_code, tempDirPath);
    await enrichUploadDir(tempDirPath, serviceContext, dependenciesDeployContexts);

    const s3FileName = `codedeploy-deployable-${uuid()}.zip`;
    winston.info(`${serviceName} - Uploading deployable artifact to S3: ${s3FileName}`);
    const s3ArtifactInfo = await deployPhase.uploadDeployableArtifactToHandelBucket(serviceContext, tempDirPath, s3FileName);
    winston.info(`${serviceName} - Uploaded deployable artifact to S3: ${s3FileName}`);

    util.deleteFolderRecursive(tempDirPath); // Delete the whole temp folder now that we're done with it
    return s3ArtifactInfo;
}
