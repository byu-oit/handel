const AWS = require('aws-sdk')

const REGION = 'us-west-2'
const DOMAIN = process.env['SEARCH_DOMAIN_ENDPOINT']
const INDEX = 'node-test'
const TYPE = 'node-type'
const ID = '1'

exports.handler = function (req, context, callback) {
  console.log('Hello!')
  const endpoint = new AWS.Endpoint(DOMAIN)
  const request = new AWS.HttpRequest(endpoint, REGION)

  const document = {
    'title': 'Moneyball',
    'director': 'Bennett Miller',
    'year': '2011'
  }

  request.method = 'PUT'
  request.path += INDEX + '/' + TYPE + '/' + ID
  request.body = JSON.stringify(document)
  request.headers['host'] = DOMAIN
  request.headers['Content-Type'] = 'application/json'

  const credentials = new AWS.EnvironmentCredentials('AWS')
  const signer = new AWS.Signers.V4(request, 'es')
  signer.addAuthorization(credentials, new Date())

  const client = new AWS.HttpClient()
  console.log('Making request')
  client.handleRequest(request, null, function (response) {
    console.log('Made request')
    console.log(response.statusCode + ' ' + response.statusMessage)
    var responseBody = ''
    response.on('data', function (chunk) {
      responseBody += chunk
    })
    response.on('end', function (chunk) {
      console.log('Response body: ' + responseBody)
      context.succeed({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: responseBody
      })
    })
  }, function (error) {
    console.log('Error: ' + error)
    context.succeed({
      statusCode: 500,
      headers: {
        'Content-Type': 'text/plain'
      },
      body: error.message
    })
  })
}
