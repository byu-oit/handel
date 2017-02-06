# AWS Deploy
This library provides deployments for applications in AWS based off a declarative specification file.

# Library Usage
./appdeploy

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

systems:
  <system_name>:
    <service_name>:
      type: <service_type>
      <service_config_params>
```

# Supported Services
The following services are supported for deployments:

## DynamoDB
```
partition_key: # Required, NOT updateable
  name: <partition_key>
  type: Number|String

sort_key: # Optional, NOT updateable
  name: <sort_key> 
  type: Number|String

provisioned_throughput:
  read_capcity_units: <number>
  write_capacity_units: <number>
```

#TODO 
* Figure out how to handle updates - Guiding principle is to not have downtime, so manual restarts may be necessary. NO DATA LOSS SHOULD EVER OCCUR (NO REPLACEMENT)
