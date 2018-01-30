import {ServiceConfig, ServiceContext, Tags} from '../datatypes';

export const TAG_KEY_PATTERN = `[a-zA-Z0-9+\-=._:\\/@]{1,127}`;
export const TAG_KEY_REGEX = RegExp(`^${TAG_KEY_PATTERN}$`);
export const TAG_VALUE_MAX_LENGTH = 255;

export function getTags(serviceContext: ServiceContext<ServiceConfig>): Tags {
    const serviceParams = serviceContext.params;

    const handelTags: Tags = {
        app: serviceContext.appName,
        env: serviceContext.environmentName
    };

    const appTags = serviceContext.tags;

    const serviceTags = serviceParams.tags;

    // Service tags overwrite app tags, which overwrite Handel tags
    return Object.assign({}, handelTags, appTags, serviceTags);
}
