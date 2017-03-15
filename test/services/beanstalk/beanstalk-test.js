const accountConfig = require('../../../lib/util/account-config')(`${__dirname}/../../test-account-config.yml`).getAccountConfig();
const beanstalk = require('../../../lib/services/beanstalk');
