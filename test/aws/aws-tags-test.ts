import { expect } from 'chai';
import * as tags from '../../src/aws/aws-tags';

describe('aws-tags', () => {
    describe('toAWSTagStyle', () => {
        it('should convert simple key-values to an array of AWS tags', () => {
            const input = {
                tag: 'value',
                another: 'another value'
            };
            const result = tags.toAWSTagStyle(input);
            expect(result).to.have.lengthOf(2);
            expect(result).to.deep.include({
                Key: 'tag',
                Value: 'value'
            });
            expect(result).to.deep.include({
                Key: 'another',
                Value: 'another value'
            });
        });
    });
});
