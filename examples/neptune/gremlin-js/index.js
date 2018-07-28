const gremlin = require('gremlin')
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection
const Graph = gremlin.structure.Graph

const dc = new DriverRemoteConnection(`ws://${process.env.DB_CLUSTER_ENDPOINT}:${process.env.DB_PORT}/gremlin`)
const graph = new Graph()
const g = graph.traversal().withRemote(dc)

g.addV('person').property('name', 'David')

exports.handler = async function (event, context) {
  try {
    const data = await g.V().limit(1).count().next()
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
