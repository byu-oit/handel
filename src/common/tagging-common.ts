import {ServiceConfig, ServiceContext, Tags} from '../datatypes';

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
