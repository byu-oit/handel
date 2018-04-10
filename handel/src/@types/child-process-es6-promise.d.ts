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

declare module 'child-process-es6-promise' {

    import { ChildProcess, ExecOptions, SpawnOptions } from 'child_process';

    function exec(command: string, args: string[], opts?: ExecOptions): PromiseWithChild<ExecOutput>;

    function spawn(command: string, args: string[], opts?: SpawnOptions): PromiseWithChild<SpawnOutput>;

    interface ExecOutput {
        stdout: Buffer;
    }

    interface SpawnOutput {
        code: number;
        signal: string;
        stderr: Buffer;
        stdout: Buffer;
    }

    interface PromiseWithChild<T> extends Promise<T> {
        child: ChildProcess;
    }
}
