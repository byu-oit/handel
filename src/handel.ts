import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as minimist from 'minimist';
import * as cli from './cli';

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
    const usageMsg = `Usage: handel deploy -c <accountConfig> -e <envsToDeploy> -v <deployVersion>

Options:
-c [required] -- Path to account config or base64 encoded JSON string of config
-e [required] -- A comma-separated list of environments from your handel file to deploy
-d -- If this flag is set, verbose debug output will be enabled

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

function loadHandelFile() {
    try {
        return yaml.safeLoad(fs.readFileSync('./handel.yml', 'utf8'));
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
    const handelFile = loadHandelFile();
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
            cli.checkAction(handelFile, argv);
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
