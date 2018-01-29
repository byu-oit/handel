import {Tags} from '../datatypes';

export interface GenericAWSTag {
    Key: string;
    Value: string;
}

export type GenericAWSTagSet = GenericAWSTag[];

export function toAWSTagStyle(tags: Tags): GenericAWSTagSet {
    return Object.getOwnPropertyNames(tags)
        .map(name => {
            return {
                Key: name,
                Value: tags[name]
            };
        });
}
