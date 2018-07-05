import * as Ajv from 'ajv';
import * as fs from 'fs';
import { ServiceConfig, ServiceContext } from 'handel-extension-api';

export function checkJsonSchema(schemaPath: string, serviceContext: ServiceContext<ServiceConfig>): string[] {
    const ajv = new Ajv({allErrors: true, jsonPointers: true});
    require('ajv-errors')(ajv);
    let schema;
    try {
        schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    }
    catch (e) {
        return [`Couldn't read schema file to check the service schema`];
    }
    const valid = ajv.validate(schema, serviceContext.params);
    if (!valid) {
        return ajv.errors!.map(error => error.message!);
    }
    else {
        return [];
    }
}
