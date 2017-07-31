set -eux

#####################################################################
# This is a very rudimentary release script. It takes the release 
# type as a parameter: "patch", "minor", or "major".
#
# It uses NPM to create a relase commit and tag, then publish to 
# NPM and push the release to GitHub
#####################################################################

# Create version commit and tag
npm version $1

# Push commit and tag to GitHub
git push
VERSION=$(cat package.json | jq -r '.version')
git push origin v$VERSION

# Publish package to NPM
npm publish