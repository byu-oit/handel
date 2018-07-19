const fs = require('fs-extra')

const SRC_DIR = `${__dirname}/src`
const DIST_DIR = `${__dirname}/dist`

function clean () {
  console.log('Cleaning dist/ directory')
  fs.removeSync(DIST_DIR)
  console.log('Finished clean')
}

function moveNonTsFiles () {
  const nonTsFilter = (src, dest) => {
    if (!src.endsWith('.ts')) {
      return true
    }
    return false
  }

  console.log('Copying non-JS files')
  fs.copySync(SRC_DIR, DIST_DIR, { filter: nonTsFilter })
  console.log('Finished copying non-TS files')
}

switch (process.argv[2]) {
  case 'clean':
    clean()
    break
  case 'move-non-ts-files':
    moveNonTsFiles()
    break
  default:
    console.log('Unsupported command')
    process.exit(1)
}
