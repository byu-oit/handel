Handel vs. CloudFormation
=========================

Introduction
------------
This page contains information comparing CloudFormation to Handel.

CloudFormation
--------------
CloudFormation is one of the most popular ways to deploy applications to AWS. It is an extremely flexible tool that allows you great control over how you wire up applications. That flexibility comes at the cost of complexity. You need to learn quite a bit before you can ever deploy your first production-quality application.

Here is an example CloudFormation template that creates a Beanstalk server and wires it up with an S3 bucket, a DynamoDB table, and an SQS queue:

.. code-block:: yaml

  AWSTemplateFormatVersion: '2010-09-09'
  Description: Beanstalk application with SQS queue, S3 bucket, and DynamoDB table

  Resources:
    Queue:
      Type: AWS::SQS::Queue
      Properties: 
        DelaySeconds: 0      
        MaximumMessageSize: 262144
        MessageRetentionPeriod: 345600
        QueueName: dsw88-testapp-dev-queue-sqs
        ReceiveMessageWaitTimeSeconds: 0
        VisibilityTimeout: 30

    Table:
      Type: "AWS::DynamoDB::Table"
      Properties:
        AttributeDefinitions:
        - AttributeName: MyPartitionKey
          AttributeType: S
        KeySchema:
        - AttributeName: MyPartitionKey
          KeyType: HASH
        ProvisionedThroughput:
          ReadCapacityUnits: 1
          WriteCapacityUnits: 1
        TableName: dsw88-testapp-dev-table-dynamodb

    Bucket:
      Type: "AWS::S3::Bucket"
      Properties: 
        BucketName: dsw88-testapp-dev-bucket-s3
        VersioningConfiguration:
          Status: Enabled
    
    BeanstalkRole:
      Type: AWS::IAM::Role
      Properties: 
        AssumeRolePolicyDocument:
          Version: '2012-10-17'
          Statement:
          - Sid: ''
            Effect: Allow
            Principal:
              Service: ec2.amazonaws.com
            Action: sts:AssumeRole
        Path: /services/
        RoleName: dsw88-testapp-dev-webapp-beanstalk

    BeanstalkPolicy:
      Type: AWS::IAM::Policy
      Properties: 
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
          - Effect: Allow
            Action:
            - s3:ListBucket
            Resource:
            - arn:aws:s3:::dsw88-testapp-dev-bucket-s3
          - Effect: Allow
            Action:
            - s3:PutObject
            - s3:GetObject
            - s3:DeleteObject
            Resource:
            - arn:aws:s3:::dsw88-testapp-dev-bucket-s3/*
          - Effect: Allow
            Action:
            - sqs:ChangeMessageVisibility
            - sqs:ChangeMessageVisibilityBatch
            - sqs:DeleteMessage
            - sqs:DeleteMessageBatch
            - sqs:GetQueueAttributes
            - sqs:GetQueueUrl
            - sqs:ListDeadLetterSourceQueues
            - sqs:ListQueues
            - sqs:PurgeQueue
            - sqs:ReceiveMessage
            - sqs:SendMessage
            - sqs:SendMessageBatch
            Resource:
            - arn:aws:sqs:us-west-2:111111111111:dsw88-testapp-dev-queue-sqs
          - Sid: DyanmoDBAccessT7eFcR52BF7VnlQF
            Effect: Allow
            Action:
            - dynamodb:BatchGetItem
            - dynamodb:BatchWriteItem
            - dynamodb:DeleteItem
            - dynamodb:DescribeLimits
            - dynamodb:DescribeReservedCapacity
            - dynamodb:DescribeReservedCapacityOfferings
            - dynamodb:DescribeStream
            - dynamodb:DescribeTable
            - dynamodb:GetItem
            - dynamodb:GetRecords
            - dynamodb:GetShardIterator
            - dynamodb:ListStreams
            - dynamodb:PutItem
            - dynamodb:Query
            - dynamodb:Scan
            - dynamodb:UpdateItem
            Resource:
            - arn:aws:dynamodb:us-west-2:111111111111:table/dsw88-testapp-dev-table-dynamodb
          - Sid: BucketAccess
            Action:
            - s3:Get*
            - s3:List*
            - s3:PutObject
            Effect: Allow
            Resource:
            - arn:aws:s3:::elasticbeanstalk-*
            - arn:aws:s3:::elasticbeanstalk-*/*
          - Sid: XRayAccess
            Action:
            - xray:PutTraceSegments
            - xray:PutTelemetryRecords
            Effect: Allow
            Resource: "*"
          - Sid: CloudWatchLogsAccess
            Action:
            - logs:PutLogEvents
            - logs:CreateLogStream
            Effect: Allow
            Resource:
            - arn:aws:logs:*:*:log-group:/aws/elasticbeanstalk*
          - Sid: ECSAccess
            Effect: Allow
            Action:
            - ecs:Poll
            - ecs:StartTask
            - ecs:StopTask
            - ecs:DiscoverPollEndpoint
            - ecs:StartTelemetrySession
            - ecs:RegisterContainerInstance
            - ecs:DeregisterContainerInstance
            - ecs:DescribeContainerInstances
            - ecs:Submit*
            - ecs:DescribeTasks
            Resource: "*"
        PolicyName: dsw88-testapp-dev-webapp-beanstalk
        Roles:
        - !Ref BeanstalkRole

    InstanceProfile:
      Type: AWS::IAM::InstanceProfile
      Properties: 
        Path: "/services/"
        Roles:
        - !Ref BeanstalkRole

    BeanstalkSecurityGroup:
      Type: "AWS::EC2::SecurityGroup"
      Properties: 
        GroupDescription: dsw88-testapp-dev-webapp-beanstalk
        VpcId: vpc-aaaaaaaa
        SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: '22'
          ToPort: '22'
          SourceSecurityGroupId: sg-44444444
        SecurityGroupEgress:
        - IpProtocol: tcp
          FromPort: '0'
          ToPort: '65335'
          CidrIp: 0.0.0.0/0
        Tags:
        - Key: Name
          Value: dsw88-testapp-dev-webapp-beanstalk
    
    BeanstalkIngressToSelf:
      Type: AWS::EC2::SecurityGroupIngress
      Properties:
        GroupId:
          Ref: BeanstalkSecurityGroup
        IpProtocol: tcp
        FromPort: '0'
        ToPort: '65335'
        SourceSecurityGroupId:
          Ref: BeanstalkSecurityGroup
    
    Application:
      Type: AWS::ElasticBeanstalk::Application
      Properties:
        ApplicationName: dsw88-testapp-dev-webapp-beanstalk
        Description: Application for dsw88-testapp-dev-webapp-beanstalk
    
    ApplicationVersion:
      Type: AWS::ElasticBeanstalk::ApplicationVersion
      Properties:
        ApplicationName: !Ref Application
        Description: Application version for dsw88-testapp-dev-webapp-beanstalk
        SourceBundle:
          S3Bucket: beanstalk-us-west-2-111111111111
          S3Key: dsw88-testapp/dev/webapp/beanstalk-deployable-SOME_GUID.zip
    
    ConfigurationTemplate:
      DependsOn:
      - Queue
      - Table
      - Bucket
      - BeanstalkSecurityGroup
      - InstanceProfile
      Type: AWS::ElasticBeanstalk::ConfigurationTemplate
      Properties:
        ApplicationName: !Ref Application
        Description: Configuration template for dsw88-testapp-dev-webapp-beanstalk
        OptionSettings:
        - Namespace: aws:autoscaling:launchconfiguration
          OptionName: IamInstanceProfile
          Value: !Ref InstanceProfile
        - Namespace: aws:autoscaling:asg
          OptionName: MinSize
          Value: 1
        - Namespace: aws:autoscaling:asg
          OptionName: MaxSize
          Value: 1
        - Namespace: aws:autoscaling:launchconfiguration
          OptionName: InstanceType
          Value: t2.micro
        - Namespace: aws:autoscaling:launchconfiguration
          OptionName: SecurityGroups
          Value: !Ref BeanstalkSecurityGroup
        - Namespace: aws:autoscaling:updatepolicy:rollingupdate
          OptionName: RollingUpdateEnabled
          Value: true
        - Namespace: aws:ec2:vpc
          OptionName: VPCId
          Value: vpc-aaaaaaaa
        - Namespace: aws:ec2:vpc
          OptionName: Subnets
          Value: subnet-ffffffff,subnet-77777777
        - Namespace: aws:ec2:vpc
          OptionName: ELBSubnets
          Value: subnet-22222222,subnet-66666666
        - Namespace: aws:ec2:vpc
          OptionName: DBSubnets
          Value: subnet-eeeeeeee,subnet-cccccccc
        - Namespace: aws:ec2:vpc
          OptionName: AssociatePublicIpAddress
          Value: false
        - Namespace: aws:elasticbeanstalk:application:environment
          OptionName: MY_INJECTED_VAR
          Value: myValue
        SolutionStackName: 64bit Amazon Linux 2016.09 v4.0.1 running Node.js
    
    Environment:
      Type: "AWS::ElasticBeanstalk::Environment"
      Properties:
        ApplicationName: !Ref Application
        Description: environment for dsw88-testapp-dev-webapp-beanstalk
        TemplateName: !Ref ConfigurationTemplate
        VersionLabel: !Ref ApplicationVersion
        Tags:
        - Key: Name
          Value: dsw88-testapp-dev-webapp-beanstalk

  Outputs:
    BucketName:
      Description: The endpoint URL of the beanstalk environment
      Value: 
        Fn::GetAtt: 
          - Environment
          - EndpointURL

Handel
------
Handel is a deployment library that actually runs *on top of* CloudFormation. The services you specify in Handel are turned into CloudFormation templates that are created on your behalf. 

Because of this approach, Handel frees you from having to worry about the detail of CloudFormation, as well as security services such as IAM and VPC. This simplicity comes at the cost of lack of flexibility in some cases. For example, when wiring up permissions between a Beanstalk app and an S3 bucket, you don't get to choose what permissions exactly will be applied. Handel will apply what it considers to be reasonable and secure permissions.

Here is an example Handel file that creates the same set of resources (Beanstalk, S3, DynamoDB, and SQS) as the CloudFormation template above:

.. code-block:: yaml
   
  version: 1

  name: dsw88-testapp

  environments:
    dev:
      webapp:
        type: beanstalk
        path_to_code: .
        solution_stack: 64bit Amazon Linux 2016.09 v4.0.1 running Node.js
        instance_type: t2.micro
        health_check_url: /
        min_instances: 1
        max_instances: 1
        environment_variables:
          MY_INJECTED_VAR: myValue
        dependencies:
        - bucket
        - queue
        - table
      bucket:
        type: s3
      queue:
        type: sqs
      table:
        type: dynamodb
        partition_key:
          name: MyPartionKey
          type: String
        provisioned_throughput:
          read_capcity_units: 1
          write_capacity_units: 1

Note the greatly reduced file size, as well as the lack of any IAM or VPC configuration details.

