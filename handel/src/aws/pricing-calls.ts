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

function convertMemoryStringToMemoryUnits(inputString: string) {
    // Converts the given GiB into the amazon units
    const gibiBitesOfMemory = inputString.split('GiB', 1);
    const amazonMemoryUnits = Number(gibiBitesOfMemory) * 1000;
    return amazonMemoryUnits;
}

export async function getMemoryForInstance(instanceType: string): Promise<number> {
    const getProductsParams = {
        ServiceCode: 'AmazonEC2',
        Filters: [
            {
                Type: 'TERM_MATCH',
                Field: 'instanceType',
                Value: instanceType
            },
            {
                Type: 'TERM_MATCH',
                Field: 'location',
                Value: 'US West (Oregon)'
            }
        ],
        MaxResults: 1
    };
    try {
        const response = await awsWrapper.pricing.getProducts(getProductsParams);
        if (!response.PriceList || !response.PriceList[0]) {
            throw new Error(`Price list does not exits for instance type specified: ${instanceType}`);
        }
        const priceList = response.PriceList[0] as any;
        const memory: string = priceList.product.attributes.memory; // Something like '4 GiB'
        const memoryUnits: number = convertMemoryStringToMemoryUnits(memory); // Convert '4 GiB' to 4000
        return memoryUnits;
    } catch (e) {
        // Maybe we want to log the error?
        throw new Error(`Could not run code to find price list for the instance type specified: ${instanceType}`);
    }
}
