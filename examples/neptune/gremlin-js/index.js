const crypto = require('crypto-js')
const moment = require('moment')
// const gremlin = require('gremlin')
// const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection
// const Graph = gremlin.structure.Graph

// const dc = new DriverRemoteConnection(`ws://${process.env.DB_CLUSTER_ENDPOINT}:${process.env.DB_PORT}/gremlin`)
// const graph = new Graph()
// const g = graph.traversal().withRemote(dc)

// g.addV('person').property('name', 'David')

function getSignatureKey (key, dateStamp, regionName, serviceName) {
  var kSecret = 'AWS4' + key
  var kDate = crypto.HmacSHA256(dateStamp, kSecret)
  var kRegion = crypto.HmacSHA256(regionName, kDate)
  var kService = crypto.HmacSHA256(serviceName, kRegion)
  var kSigning = crypto.HmacSHA256('aws4_request', kService)
  return kSigning
}

function sign (signatureKey, stringToSign) {
  var unencodedSignature = crypto.HmacSHA256(stringToSign, signatureKey)
  return unencodedSignature
}

function getSignature (stringToSign, secretKey, dateStamp, regionName, serviceName) {
  var signingKey = getSignatureKey(secretKey, dateStamp, regionName, serviceName)

  return sign(signingKey, stringToSign)
}

exports.handler = async function (event, context) {
  try {
    const algorithm = 'AWS4-HMAC-SHA256'
    const currentTime = moment()
    const amzDate = currentTime.format('YYYYMMDDTHHmmss[Z]')
    const regionName = 'us-west-2'
    const dateStamp = currentTime.format('YYYYMMDD')
    const serviceName = 'neptune-db'
    const credentialScope = dateStamp + '/' + regionName + '/' + serviceName + '/' + 'aws4_request'
    const method = 'GET'
    const canonicalUri = '/gremlin/'
    const canonicalQueryString = 'TODO'
    const canonicalHeaders = 'TODO'
    const signedHeaders = 'TODO'
    const payloadHash = 'TODO'
    const canonicalRequest = method + '\n' + canonicalUri + '\n' + canonicalQueryString + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + payloadHash
    const canonicalRequestHash = crypto.SHA256(canonicalRequest).toString()
    let stringToSign = algorithm + '\n' + amzDate + '\n' + credentialScope + '\n' + canonicalRequestHash
    const secretKey = process.env['AWS_SECRET_ACCESS_KEY']

    const signature = getSignature(stringToSign, secretKey, dateStamp, regionName, serviceName)
    const data = {
      sig: signature.toString(),
      secretKey
    }
    // const data = await g.V().limit(1).count().next()
    return {
      statusCode: 200,
      headers: {},
      body: JSON.stringify(data)
    }
  } catch (err) {
    console.log('ERROR', err)
    return {
      statusCode: 500,
      headers: {},
      body: err
    }
  }
}
