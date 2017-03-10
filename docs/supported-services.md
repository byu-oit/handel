# Limits
The following limits exist on names in the deploy spec:
```
app name: 15 characters
environment name: 10 characters
service name: 10 characters
```
There may be other service-specific limits. See the "Supported Services" section for information on service-specific limits.

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

Updateable parameters:
None: Updates will take the database out of commission while updating. You must manually change the parameters in DynamoDB at an opportune time for your service.


## Elastic File System (EFS)
```
performance_mode: <general_purpose|max_io>
```

## Elastic Container Service (ECS)
ECS is not fully supported yet. Many parameters are not supported yet.
```
image_name: <the name of the Docker image to pull>
port_mappings:
- <port>
max_memory: <max memory to use in MB>
cpu_units: <min cpu units>
environment_variables:
  <key>: <value>
```