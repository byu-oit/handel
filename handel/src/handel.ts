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
import * as yaml from 'js-yaml';
import * as minimist from 'minimist';
import * as cli from './cli';
import { HandelFile } from './datatypes';

function printAndExit(msg: string): void {
    // tslint:disable-next-line:no-console
    console.log(msg);
    process.exit(1);
}

function printGeneralUsage(): void {
    const usageMsg = `Usage: handel <action> <args>

Action:
check -- Checks the contents of your Handel file for errors.
deploy -- Deploys the given environments from your Handel file to your AWS account.
delete -- Deletes the given environments from your Handel file out of your AWS account.

Each phase has its own unique set of arguments it requires`;
    printAndExit(usageMsg);
}

function printDeployUsage(deployErrors: string[]): void {
    const usageMsg = `Usage: handel deploy -c <accountConfig> -e <envsToDeploy> -v <deployVersion> -t <key1>=<value1>,<key2>=<value2>

Options:
-c [required] -- Path to account config or base64 encoded JSON string of config
-e [required] -- A comma-separated list of environments from your handel file to deploy
-d -- If this flag is set, verbose debug output will be enabled
-t -- If this flag is set, specifies a comma-separated list of extra application-level tags to apply to resources.

Errors:
  ${deployErrors.join('\n  ')}`;
    printAndExit(usageMsg);
}

function printDeleteUsage(deleteErrors: string[]): void {
    const usageMsg = `Usage: handel delete -c <accountConfig> -e <envsToDelete>

Options:
-c [required] -- Path to account config or base64 encoded JSON string of config
-e [required] -- A comma-separated list of environments from your handel file to deploy
-d -- If this flag is set, verbose debug output will be enabled
-y -- If this flag is set, you will *not* be asked to confirm the delete action

Errors:
  ${deleteErrors.join('\n  ')}`;
    printAndExit(usageMsg);
}

function loadHandelFile(): HandelFile | undefined {
    try {
        return yaml.safeLoad(fs.readFileSync('./handel.yml', 'utf8')) as HandelFile;
    }
    catch (e) {
        if (e.code === 'ENOENT') {
            printAndExit(`No 'handel.yml' file found in this directory. You must run Handel in the directory containing the Handel file.`);
        }
        else if (e.name === 'YAMLException') {
            printAndExit(`Malformed 'handel.yml' file. Make sure your Handel file is a properly formatted YAML file. You're probably missing a space or two somewhere`);
        }
        else {
            printAndExit(`Unexpected error while loading 'handel.yml' file: ${e}`);
        }
    }
}

export async function run() {
    const handelFile = loadHandelFile()!; // It wil either come back with a HandelFile object or exit inside the method
    const deployPhase = process.argv[2];
    const argv = minimist(process.argv.slice(2));
    let errors = [];
    switch (deployPhase ? deployPhase.toLowerCase() : '') {
        case 'deploy':
            errors = cli.validateDeployArgs(argv, handelFile);
            if (errors.length > 0) {
                printDeployUsage(errors);
            }
            else {
                await cli.deployAction(handelFile, argv);
            }
            break;
        case 'check':
            await cli.checkAction(handelFile, argv);
            break;
        case 'delete':
            errors = cli.validateDeleteArgs(argv, handelFile);
            if (errors.length > 0) {
                printDeleteUsage(errors);
            }
            else {
                await cli.deleteAction(handelFile, argv);
            }
            break;
        default:
            printGeneralUsage();
    }
}
