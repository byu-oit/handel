# aws-deploy (PROTOTYPE)
This library provides deployments for applications in AWS based off a declarative specification file.

# Library Usage
```
aws-deploy --environment-to-deploy <env_from_spec_file> --account-config-file <path_to_account_config_file> --deploy-spec-file <path_to_deploy_spec_file> --deploy-version <version_being_deployed>
```

# Credits
Many of these concepts were introduced by the platform engineers at FamilySearch. In particular, I'd like to recognize Michael Wright and Stephen Kinser, whose deploy lifecycle ideas are adapted to this library.

# TODO
* Add limits on app, environment, and service names (AWS has limits on certain resources)
  * App name - 10 character
  * Environment name - 10 characters
  * Service name - 10 characters
* Figure out how to enforce tagging spec
* Need to figure out how to handle secrets. How can you get things like WSO2 credentials from DynamoDB? Probably a secured S3 bucket
* Add acceptance test validating deploy functionality (include teardown)