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

import {
    allScmProviders,
    ExtensionDefinition,
    ExtensionSource,
    FileExtensionDefinition,
    GitExtensionDefinition, InvalidExtensionSpecificationError,
    NpmExtensionDefinition,
    ScmExtensionDefinition,
    ScmProvider
} from '../datatypes';

const FILE_PREFIX = 'file:';
const GIT_PREFIX = 'git:';
const scmUrlishPattern = /^([^/]+)\/([^#]+)(?:#(.+))?$/;

export function parseExtensionSpec(prefix: string, spec: string): ExtensionDefinition {
    const parser = getParserFor(spec);
    if (!parser) {
        throw new InvalidExtensionSpecificationError(spec, 'Could not parse the extension specification');
    }
    return parser.parse(prefix, spec);
}

interface SpecParser<Type extends ExtensionDefinition> {
    claim(spec: string): boolean;

    parse(prefix: string, spec: string): Type;
}

class NpmParser implements SpecParser<NpmExtensionDefinition> {

    public claim(spec: string): boolean {
        return true;
    }

    public parse(prefix: string, spec: string): NpmExtensionDefinition {
        let toParse = spec;
        let namePrefix = '';
        if (spec.startsWith('@')) { // Handle scoped NPM packages (https://github.com/byu-oit/handel/issues/438)
            toParse = spec.substring(1);
            namePrefix = '@';
        }

        const [parsedName, versionSpec = '*'] = toParse.split('@', 2);
        const name = namePrefix + parsedName;

        return {
            source: ExtensionSource.NPM,
            prefix,
            spec,
            name,
            versionSpec
        };
    }

}

class FileParser implements SpecParser<FileExtensionDefinition> {

    public claim(spec: string): boolean {
        return spec.startsWith(FILE_PREFIX);
    }

    public parse(prefix: string, spec: string): FileExtensionDefinition {
        const path = spec.substring(FILE_PREFIX.length);

        return {
            source: ExtensionSource.FILE,
            prefix,
            spec,
            path
        };
    }
}

class GitParser implements SpecParser<GitExtensionDefinition> {
    public claim(spec: string): boolean {
        return spec.startsWith(GIT_PREFIX);
    }

    public parse(prefix: string, spec: string): GitExtensionDefinition {
        const url = spec.substring(GIT_PREFIX.length);

        return {
            source: ExtensionSource.GIT,
            prefix,
            spec,
            url
        };
    }
}

class ScmParser implements SpecParser<ScmExtensionDefinition> {
    public claim(spec: string): boolean {
        return !!this.getScmProvider(spec);
    }

    public parse(prefix: string, spec: string): ScmExtensionDefinition {
        const provider = this.getScmProvider(spec)!!;

        const urlish = spec.substring(provider.length + 1);

        const parsed = scmUrlishPattern.exec(urlish);
        if (!parsed) {
            throw new InvalidExtensionSpecificationError(spec, `Invalid ${provider} specification: must resemble <owner>/<repo>[#<commit-ish>]. See https://docs.npmjs.com/cli/install for examples.`);
        }

        const [_, owner, repo, commitish] = parsed;

        return {
            source: ExtensionSource.SCM,
            prefix,
            spec,
            provider,
            owner,
            repo,
            commitish
        };
    }

    private getScmProvider(spec: string): ScmProvider | undefined {
        return allScmProviders.find(it => spec.startsWith(it + ':'));
    }
}

const parsers = [
    new FileParser(),
    new ScmParser(),
    new GitParser(),
    new NpmParser() // NPM parser is the default, so it needs to go last. The order of the others doesn't matter.
];

function getParserFor(spec: string): SpecParser<ExtensionDefinition> | undefined {
    return parsers.find(it => it.claim(spec));
}
