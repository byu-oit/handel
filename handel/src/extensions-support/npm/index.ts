/*
 *  @license
 *    Copyright 2018 Brigham Young University
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */
import { spawn } from 'child-process-es6-promise';
import { SpawnOptions } from 'child_process';
import * as _ from 'lodash';
import * as log from 'winston';

export interface NpmClient {
    listLinkedPackages(): Promise<LinkedPackage[]>;

    installAll(cwd: string): Promise<void>;
}

export class CliNpmClient implements NpmClient {

    public async installAll(cwd: string): Promise<void> {
        await run('install all', ['install'], false, {cwd});
    }

    public async listLinkedPackages(): Promise<LinkedPackage[]> {
        const {stdout: result} = await run('list linked packages', [
            'ls',
            '-g', '--link', '--depth', '0', '--json', '--long',
        ], true);
        const json = JSON.parse(result.toString());

        return _.entries(json.dependencies).map(([name, info]: [string, any]) => {
            return {
                name,
                path: info.link
            };
        });
    }

}

export interface LinkedPackage {
    name: string;
    path: string;
}

async function run(tag: string, args: string[], quiet: boolean = false, opts?: SpawnOptions) {
    const promise = spawn('npm', args, opts);
    const proc = promise.child;

    if (!quiet) {
        proc.stdout.on('data', (data: Buffer) => {
            data.toString().split('\n')
                .forEach(line => {
                    log.debug(`[npm - ${tag}] stdout: `, line);
                });
        });
    }

    proc.stderr.on('data', (data: Buffer) => {
        data.toString().split('\n')
            .forEach(line => {
                log.debug(`[npm - ${tag}] stderr: `, line);
            });
    });
    return promise;
}
