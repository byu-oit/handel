# aws-deploy
This library provides deployments for applications in AWS based off a declarative specification file.

# Library Usage
./aws-deploy

# Configuration File
There are some account-level configurations that you'll need to provide in order for the deployment tool to
deploy your services correctly. You provide a YAML file that contains the following:
```
# Nothing here yet
```

# Deployment File Spec
Here is the schema for the deployment file:
```
name: <application_name>

environments:
  <environment_name>:
    <service_name>:
      type: <service_type>
      dependencies:
      - <service_name>
      <service_config_params>
```


# Credits
Many of these concepts were introduced by the platform engineers at FamilySearch. In particular, I'd like to recognize Michael Wright and Stephen Kinser, whose deploy lifecycle ideas are adapted to this library.

# TODO
* Add limits on app, environment, and service names (AWS has limits on certain resources)
  * App name - 10 character
  * Environment name - 10 characters
  * Service name - 10 characters
* Figure out how to enforce tagging spec
* Try out the DynamoDB deploy process
* Figure out how to handle updates - Guiding principle is to not have downtime, so manual restarts may be necessary. NO DATA LOSS SHOULD EVER OCCUR (NO REPLACEMENT)
* Need to figure out how to handle secrets. How can you get things like WSO2 credentials from DynamoDB? Probably a secured S3 bucket
* Make sure that objects are handled well
* Consider moving deployers into their own object outside of the system context.
* Add unit tests
* Add acceptance test validating deploy functionality (include teardown)