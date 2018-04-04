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
import {camelCase} from 'change-case';
import * as commander from 'commander';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { version } from 'pjson';
import * as cli from './cli';
import { CheckOptions, DeleteOptions, DeployOptions, HandelFile } from './datatypes';

commander
    .usage('<command> [options]')
    .option('--link-extensions', '!!For Extension Developers Only!! Uses npm links to install local extensions.')
    .option('-d, --debug', 'Enable verbose debug logging')
    .version(version, '-v, --version');

commander.command('check')
    .description('Checks the contents of your Handel file for errors')
    .action((command) => {
        const opts: CheckOptions = Object.assign({}, commander.opts(), command.opts());
        runCommand(command, opts, cli.checkAction);
    });

commander.command('deploy')
    .description('Deploys the given environments from your Handel file to your AWS account')
    .option('-c, --account-config <config>', 'Required. Path to account config file or Base64-encoded string containing the JSON configuration')
    .option('-e, --environments <list>', 'Required. Comma-separated list of environments from your Handel file to deploy', list)
    .option('-t, --tags <tags>', 'Comma-separated list of extra application-level tags to apply to resources. Ex: foo=bar,baz=foo', cli.parseTagsArg)
    .option('-d, --debug', 'Enable verbose debug logging')
    .action((command, ...args) => {
        requireOptions(command, ['account-config', 'environments']);
        const opts: DeployOptions = Object.assign({}, commander.opts(), command.opts());
        runCommand(command, opts, cli.deployAction, cli.validateDeployArgs);
    });

commander.command('delete')
    .description('Deletes the given environments from your AWS Account')
    .option('-c, --account-config <config>', 'Required. Path to account config file or Base64-encoded string containing the JSON configuration')
    .option('-e, --environments <environments>', 'Required. Comma-separated list of environments from your Handel file to delete', list)
    .option('-y, --yes', 'Do *not* prompt to confirm deletion of resources')
    .action((command) => {
        requireOptions(command, ['account-config', 'environments']);
        const opts: DeleteOptions = Object.assign({}, commander.opts(), command.opts());
        runCommand(command, opts, cli.deleteAction, cli.validateDeleteArgs);
    });

function list(value: string) {
    return value.split(',');
}

export async function run() {
    commander.parse(process.argv);
}

function requireOptions(cmd: commander.Command, requiredOptions: string[]) {
    const omitted = requiredOptions.filter(name => !cmd[camelCase(name)]);
    if (omitted.length !== 0) {
        printHelpAndExit(cmd, `The following required parameters were omitted: ${omitted.join(', ')}`);
    }
}

function printAndExit(msg: string): never {
    // tslint:disable-next-line:no-console
    console.log(msg);
    return process.exit(1);
}

function printHelpAndExit(command: commander.Command, msg: string): never {
    // tslint:disable-next-line:no-console
    console.log(msg);
    command.outputHelp();
    return process.exit(1);
}

function loadHandelFile(): HandelFile | undefined {
    try {
        return yaml.safeLoad(fs.readFileSync('./handel.yml', 'utf8')) as HandelFile;
    } catch (e) {
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

type CommandFunction<Opts> = (handelFile: HandelFile, opts: Opts) => Promise<any>;
type ValidateFunction<Opts> = (handelFile: HandelFile, opts: Opts) => string[] | Promise<string[]>;

function runCommand<Opts>(command: commander.Command, options: Opts, commandFunc: CommandFunction<Opts>, validateFunc?: ValidateFunction<Opts>) {
    const handelFile = loadHandelFile()!; // It wil either come back with a HandelFile object or exit inside the method
    Promise.resolve((async () => {
        if (validateFunc) {
            const errors = await validateFunc(handelFile, options);
            if (errors.length > 0) {
                printHelpAndExit(command, errors.join('\n'));
            }
        }
        return commandFunc(handelFile, options);
    })()).catch(err => {
        // tslint:disable-next-line:no-console
        console.error(err);
        process.exit(2);
    });
}
