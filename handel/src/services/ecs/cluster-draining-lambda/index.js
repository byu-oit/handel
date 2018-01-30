
'use strict'

const AWS = require('aws-sdk');



/**
 * This function gets the instanceId from the terminate event and requests it's state change to DRAINING
 */
exports.handler = function(event,context)
{ 
  // these are now defined inside the handler so the aws-sdk-mock will work correctly
  if(!AWS.config.region)AWS.config.region = 'us-west-2';
  const ECS = new AWS.ECS({apiVersion:'2014-11-13'});
  const SZ_PAGE = 100;



  /**
   * This function iterates through a page of ec2 instance of a particular ecs cluster looking for a matching ec2 instance
   * If a match is found it is placed then the cluster name and ec2 arn are returned
   */
  const searchECSinstanceClusterPage = function(parm)
  {
    if(parm.page.containerInstanceArns.length<1)return parm;
    return ECS.describeContainerInstances({cluster:parm.cluster,containerInstances:parm.page.containerInstanceArns}).promise()
    //.then(rc=>{console.log('instances:\n'+JSON.stringify(rc,null,2));return rc;})
    .then(
      rc=>
      {
        for(let ins of rc.containerInstances)
        {
          //console.log('    ',parm.ec2id+'?','instance:',ins.containerInstanceArn,ins.ec2InstanceId);
          if(parm.ec2id!=ins.ec2InstanceId)continue;
          parm.rslt={cluster:parm.cluster,ec2id:ins.ec2InstanceId,ec2arn:ins.containerInstanceArn};
          return parm;
        }
        return parm;
      }
    );
  };



  /**
   * This function pages through all ec2 instances in a particular ecs cluster looking for a matching ec2 instance
   * This is a recursive call which will finish when either a match is found or there are no more instances in the page of results
   */
  const searchECSinstanceClusters = function(parm)
  {
    return ECS.listContainerInstances(parm.iter).promise()
    //.then(rc=>{console.log('list instances:\n'+JSON.stringify(rc,null,2));return rc;})
    .then(
      rc=>
      {
        return searchECSinstanceClusterPage({ec2id:parm.ec2id,cluster:parm.iter.cluster,page:rc});
      }
    )
    .then(
      rc=>
      {
        if(rc.rslt)
        {
          parm.rslt=rc.rslt;
          return parm;
        }
        if(rc.page.nextToken)
        {
          parm.iter.nextToken=rc.page.nextToken;
          return searchECSinstanceClusters(parm);
        }
        return parm;
      }
    );
  };



  /**
   * This function iterates through a page of ecs clusters looking for a matching ec2 instance
   * This is a recursive call which will finish when either a match is found or there are no more pages of ec2 instances for a particular ecs cluster
   */
  const searchECSclusterPage = function(parm)
  {
    let arn = parm.page.clusterArns.shift();
    if(!arn) return parm;
    //console.log('\n\n\n','cluster:',arn);
    return searchECSinstanceClusters({ec2id:parm.ec2id,iter:{cluster:arn,maxResults:SZ_PAGE}})
    .then(
      rc=>
      {
        if(rc.rslt)
        {
          parm.rslt=rc.rslt;
          return parm;
        }
        return searchECSclusterPage(parm);
      }
    );
  };



  /**
   * This function pages through all ecs clusters in the account looking for a matching ec2 instance
   * This is a recursive call which will finish when either a match is found or there are no more pages of ecs clusters
   */
  const searchECSclusters = function(parm)
  {
    return ECS.listClusters(parm.iter).promise()
    //.then(rc=>{console.log('list cluster:\n'+JSON.stringify(rc,null,2));return rc;})
    .then(
      rc=>
      {
        parm.page=rc;
        return searchECSclusterPage(parm);
      }
    )
    .then(
      rc=>
      {
        if(rc.rslt)
        {
          parm.rslt=rc.rslt;
          return parm;
        }
        if(!rc.page.nextToken)return parm;
        parm.iter.nextToken=rc.page.nextToken;
        return searchECSclusters(parm);
      }
    );
  };



  /**
   * This function searches the ecs clusters to find out which one contains the ec2 container to drain then updates its status to DRAINING if found
   */
  const drainInstance = function(parm)
  {
    // find for the cluster name this instance is part of
    return Promise.resolve().then(()=>{return searchECSclusters({ec2id:parm?parm.ec2id:null,iter:{maxResults:SZ_PAGE}});})
    //.then(dat=>{console.log('result:\n'+JSON.stringify(dat,null,2));return dat;})
    .then(dat=>{return dat.rslt;})
    .then(
      dat=>
      {
        console.log('pre-drain:\n'+JSON.stringify(dat,null,2));
        if(!dat)return dat;
        let drn =
        {
          containerInstances: [dat.ec2arn],
          status: 'DRAINING',
          cluster: dat.cluster
        };
        return ECS.updateContainerInstancesState(drn).promise()
        .then(rc=>{console.log('pst-drain:\n'+JSON.stringify(rc,null,2));return rc;})
        ;
      }
    );
  };  
      
        
        
  return drainInstance({ec2id:event.detail.EC2InstanceId});
};


