/*
 * Copyright 2017 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const AWS = require('aws-sdk');
const winston = require('winston');

exports.listInstances = function(cluster)
{
  let ECS = new AWS.ECS({apiVersion:'2014-11-13'});

  
  const filter = function(dat)
  { 
    let rc =
    {
      arn:dat.containerInstanceArn,
      id:dat.ec2InstanceId,
      status:dat.status,
      tasks:
      {
        running:dat.runningTasksCount,
        pending:dat.pendingTasksCount
      }
    };
    return rc;
  };    
        
        
  const listWk = function(rslt)
  { 
    let pLst =
    { 
      //maxResults: 1,
      nextToken:  rslt.nextToken,
      cluster:    rslt.name
    };
    return ECS.listContainerInstances(pLst).promise()
    .then(
      dat=>
      {
        if(dat.containerInstanceArns.length<1) return dat;
        let pdci =
        {
          cluster:rslt.name,
          containerInstances:dat.containerInstanceArns
        };
        //winston.debug(`${Date.now()} desc ${JSON.stringify(pdci,null,2)}`);
        return ECS.describeContainerInstances(pdci).promise()
        .then(
          pg=> 
          {
            //winston.debug('page:\n'+JSON.stringify(pg,null,2));
            for(let obj of pg.containerInstances)
            {
              rslt.ec2.push(filter(obj));
            }
            return dat;
          }
        );
      }
    )
    .then(
      dat=>
      {
        if(dat.nextToken)
        {
          rslt.nextToken=dat.nextToken;
          return exports.listWk(rslt);
        }
        delete rslt.nextToken;
        return rslt;
      }
    )
    .catch(
      err=>
      {
        winston.error(`Error:\n${JSON.stringify(err,null,2)}\n${err.stack}`);
        return null;
      }
    );
  };

  return listWk({name:cluster,ec2:[]});
};

