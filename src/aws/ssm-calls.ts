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
import awsWrapper from './aws-wrapper';

export function storeParameter(paramName: string, paramType: string, paramValue: string): Promise<AWS.SSM.PutParameterResult> {
    const putParams = {
        Name: paramName,
        Type: paramType,
        Value: paramValue,
        Description: 'Handel-injected parameter',
        Overwrite: true
    };
    return awsWrapper.ssm.putParameter(putParams);
}

/**
 * Given a list of parameter names, deletes those parameters
 */
export async function deleteParameters(parameterNames: string[]) {
    const deletePromises = [];

    for (const parameterName of parameterNames) {
        const deleteParams = {
            Name: parameterName
        };
        deletePromises.push(awsWrapper.ssm.deleteParameter(deleteParams));
    }

    try {
        await Promise.all(deletePromises);
        return true;
    }
    catch (err) {
        // If the param is already gone we won't count it as an error
        if (err.code === 'ParameterNotFound') {
            return true;
        }
        else {
            throw err;
        }
    }
}
