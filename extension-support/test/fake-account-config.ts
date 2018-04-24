import { AccountConfig } from 'handel-extension-api';

const accountConfig: AccountConfig = {
    account_id: '123456789012',
    region: 'us-west-2',
    vpc: 'vpc-aaaaaaaa',
    public_subnets: [
      'subnet-ffffffff',
      'subnet-gggggggg'
    ],
    private_subnets: [
      'subnet-hhhhhhhh',
      'subnet-iiiiiiii'
    ],
    data_subnets: [
      'subnet-jjjjjjjj',
      'subnet-jjjjjjjj'
    ],
    ssh_bastion_sg: 'sg-23456789',
    elasticache_subnet_group: 'FakeGroupName',
    rds_subnet_group: 'FakeGroupName',
    redshift_subnet_group: 'FakeGroupName'
};

export default accountConfig;
