set -eux

#####################################################################
# This is a very rudimentary release script. It takes the release 
# type as a parameter: "patch", "minor", or "major".
#
# It uses NPM to create a release commit and tag, then publish to
# NPM and push the release to GitHub
#####################################################################

npm run build

# Create tags, update internal deps, and publish to NPM
cdVersion=$1 npm run publish-modules

# Push commit and tag to GitHub
git push
VERSION=$(cat lerna.json | jq -r '.version')
git push origin v$VERSION
