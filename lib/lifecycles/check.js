const config = require('../util/account-config');
const util = require('../util/util');
const winston = require('winston');
const checkPhase = require('../phases/check');

exports.check = function(handelFile) {
    //Use fake account config
    config({
        account_id: 111111111111,
        region: 'us-west-2',
        vpc: 'vpc-aaaaaaaa',
        public_subnets: [
            'subnet-ffffffff',
            'subnet-44444444'
        ],
        private_subnets: [
            'subnet-00000000',
            'subnet-77777777'
        ],
        data_subnets: [
            'subnet-eeeeeeee',
            'subnet-99999999'
        ],
        ecs_ami: 'ami-66666666',
        ssh_bastion_sg: 'sg-44444444',
        on_prem_cidr: '10.10.10.10/0'
    }).getAccountConfig();

    //Load all the currently implemented service deployers from the 'services' directory
    let serviceDeployers = util.getServiceDeployers();

    //Load Handel file from path and validate it
    winston.info("Validating and parsing Handel file");
    let handelFileParser = util.getHandelFileParser(handelFile);
    handelFileParser.validateHandelFile(handelFile, serviceDeployers);

    let errors = {};
    for(let environmentToCheck in handelFile.environments) {
        let environmentContext = util.createEnvironmentContext(handelFile, handelFileParser, environmentToCheck, "1"); //Use fake version of deploy_version
        errors[environmentToCheck] = checkPhase.checkServices(serviceDeployers, environmentContext);
    }
    return errors;
}