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
import { version } from 'pjson';
import * as winston from 'winston';
import * as cli from './cli';
import { CheckOptions, DeleteOptions, DeployOptions, HandelFile } from './datatypes';

import * as program from 'caporal';

program.version(version)
    .logger(winston as any);

program.command('check', 'Checks the contents of your Handel file for errors')
    .option('--link-extensions', '!!For Extension Developers Only!! Use NPM links to resolve extensions')
    .action((args, opts, logger) => {
        return runCommand(opts as CheckOptions, cli.checkAction);
    });

program.command('deploy', 'Deploys the given environments from your Handel file to your AWS account')
    .option('-c, --account-config <config>',
        'Path to account config file or Base64-encoded string containing the JSON configuration',
        program.STRING, // TODO: Move validation into caporal validation
        null,
        true
    )
    .option('-e, --environments <list>',
        'Comma-separated list of environments from your Handel file to deploy',
        program.LIST,
        null,
        true
    )
    .option('-t, --tags <tags>',
        'Comma-separated list of extra application-level tags to apply to resources. Ex: foo=bar,baz=foo',
        program.LIST
    )
    .option('--link-extensions', '!!For Extension Developers Only!! Use NPM links to resolve extensions')
    .action((args, opts, logger) => {
        return runCommand(opts as DeployOptions, cli.deployAction);
    });

program.command('delete', 'Deletes the given Handel environment from your AWS account')
    .option('-c, --account-config <config>',
        'Path to account config file or Base64-encoded string containing the JSON configuration',
        program.STRING, // TODO: Move validation into caporal validation
        undefined,
        true
    )
    .option('-e, --environment <name>',
        'Environments from your Handel file to delete',
        program.STRING,
        undefined,
        true
    )
    .option('--link-extensions', '!!For Extension Developers Only!! Use NPM links to resolve extensions')
    .action((args, opts, logger) => {
        return runCommand(opts as DeleteOptions, cli.deleteAction);
    });

export async function run() {
    return program.parse(process.argv);
}

function printAndExit(msg: string): never {
    // tslint:disable-next-line:no-console
    console.log(msg);
    return process.exit(1);
}

function printHelpAndExit(msg: string): never {
    // tslint:disable-next-line:no-console
    console.log(msg);
    program.fatalError(new Error());
    return process.exit(1);
}

function loadHandelFile(): HandelFile {
    try {
        return yaml.safeLoad(fs.readFileSync('./handel.yml', 'utf8')) as HandelFile;
    } catch (e) {
        if (e.code === 'ENOENT') {
            return printAndExit(`No 'handel.yml' file found in this directory. You must run Handel in the directory containing the Handel file.`);
        }
        else if (e.name === 'YAMLException') {
            return printAndExit(`Malformed 'handel.yml' file. Make sure your Handel file is a properly formatted YAML file. You're probably missing a space or two somewhere`);
        }
        else {
            return printAndExit(`Unexpected error while loading 'handel.yml' file: ${e}`);
        }
    }
}

type CommandFunction<Opts> = (handelFile: HandelFile, opts: Opts) => Promise<any>;
type ValidateFunction<Opts> = (handelFile: HandelFile, opts: Opts) => string[] | Promise<string[]>;

function runCommand<Opts>(options: Opts, commandFunc: CommandFunction<Opts>, validateFunc?: ValidateFunction<Opts>) {
    console.log('opts', options);
    const handelFile = loadHandelFile()!; // It wil either come back with a HandelFile object or exit inside the method
    Promise.resolve((async () => {
        if (validateFunc) {
            const errors = await validateFunc(handelFile, options);
            if (errors.length > 0) {
                printHelpAndExit(errors.join('\n'));
            }
        }
        return commandFunc(handelFile, options);
    })()).catch(err => {
        // tslint:disable-next-line:no-console
        console.error(err);
        process.exit(2);
    });
}
