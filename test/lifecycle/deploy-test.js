const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const deployPhase = require('../../lib/lifecycle/deploy');