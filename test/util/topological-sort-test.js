const accountConfig = require('../../lib/util/account-config')(`${__dirname}/../test-account-config.yml`).getAccountConfig();
const topologicalSort = require('../../lib/util/topological-sort');