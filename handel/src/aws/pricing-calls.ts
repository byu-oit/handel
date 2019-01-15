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

function convertMemoryStringToMemoryUnits(inputString: string): number {
    // Converts the given GiB into the amazon units
    const gibiBitesOfMemory = inputString.split('GiB', 1)[0];
    const amazonMemoryUnits = Number(gibiBitesOfMemory.trim()) * 1000;
    return amazonMemoryUnits;
}

interface AWSRegionMap {
    [key: string]: string;
}

const AWS_REGION_MAP: AWSRegionMap = {
    'us-west-2': 'US West (Oregon)',
    'us-west-1': 'US West (N. California)',
    'us-east-2': 'US East (Ohio)',
    'us-east-1': 'US East (N. Virginia)',
    'ap-south-1': 'Asia Pacific (Mumbai)',
    'ap-northeast-2': 'Asia Pacific (Seoul)',
    'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'ap-southeast-1': 'Asia Pacific (Singapore)',
    'ap-southeast-2': 'Asia Pacific (Sydney)',
    'ca-central-1': 'Canada (Central)',
    'cn-north-1': 'China (Beijing)',
    'eu-central-1': 'EU (Frankfurt)',
    'eu-west-1': 'EU (Ireland)',
    'eu-west-2': 'EU (London)',
    'eu-west-3': 'EU (Paris)',
    'sa-east-1': 'South America (São Paulo)',
    'us-gov-west-1': 'AWS GovCloud (US)'
};

export async function getMemoryForInstance(instanceType: string, region: string): Promise<number> {
    const regionPricingName = AWS_REGION_MAP[region];
    if (!regionPricingName) {
        throw new Error(`Invalid/Unknown region name specified: ${region}`);
    }
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
                Value: regionPricingName
            }
        ],
        MaxResults: 1
    };
    try {
        const response = await awsWrapper.pricing.getProducts(getProductsParams);
        if (!response.PriceList || !response.PriceList[0]) {
            throw new Error(`Price list does not exist for instance type specified: ${instanceType}`);
        }
        const priceList = response.PriceList[0] as any;
        const memory: string = priceList.product.attributes.memory; // Something like '4 GiB'
        const memoryUnits = convertMemoryStringToMemoryUnits(memory); // Convert '4 GiB' to 4000
        return memoryUnits;
    } catch (e) {
        // Maybe we want to log the error?
        throw new Error(`Could not obtain memory information for the instance type specified: ${instanceType}`);
    }
}
