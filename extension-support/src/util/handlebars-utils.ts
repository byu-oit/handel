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
import * as handlebars from 'handlebars';
import * as util from './util';

handlebars.registerHelper('logicalId', util.normalizeLogicalId);

/**
 * Given a handlebars template filename and a Javascript object of the variables
 * to inject in that template, compiles and returns the template
 *
 * @param {String} filename - The full path of the template file on disk to read
 * @param {Object} variables - A Javascript object containing the variables to be used by Handlebars for the template
 * @returns {Promise<String>} - The finished template with variables replaced
 */
export function compileTemplate(filename: string, variables: any): Promise<string> {
    // TODO - This doesn't handle errors yet
    return new Promise((resolve, reject) => {
        fs.readFile(filename, 'utf-8', (error, source) => {
            // Register any helpers we need
            const template = handlebars.compile(source, {noEscape: true});
            const output = template(variables);
            resolve(output);
        });
    });
}
