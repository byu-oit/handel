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

exports.cycleInstances = function(ecs)
{
  let ASG = new AWS.AutoScaling({apiVersion:'2011-01-01'});

  const dly = function(ms)
  {       
    return new Promise(
      function(resolv,reject)
      { 
        setTimeout(function(){resolv();},ms);
      } 
    );    
  };

  const recycleWk = function(rslt,ecs)
  {
    if(ecs.ec2.length<1)return rslt;
    let obj = ecs.ec2.shift();
    winston.debug(`${Date.now()} recycle:\n${JSON.stringify(obj,null,2)}`);
    let parm =
    {
      InstanceId:obj.id,
      ShouldDecrementDesiredCapacity:false
    };
    winston.debug(`${Date.now()} rp:\n${JSON.stringify(parm,null,2)}`);
    return ASG.terminateInstanceInAutoScalingGroup(parm).promise()
    .then(
      dat=>
      {
        winston.debug(`${Date.now()} rc:\n${JSON.stringify(dat,null,2)}`);
        rslt.push(dat);
        if(ecs.ec2.length>0) return dly(60000).then(()=>{return recycleWk(rslt,ecs);});
        return rslt;
      }
    )
    .catch(
      err=>
      {
        if(err.statusCode==400&&err.message.match(/Instance Id not found/))
        {
          winston.debug(`${Date.now()} rc:\n${JSON.stringify(err,null,2)}`);
          rslt.push(err);
          return recycleWk(rslt,ecs);
        }
        winston.error(`Error:\n${JSON.stringify(err,null,2)}\n${err.stack}`);
        return null;
      }
    );
  };

  return recycleWk([],ecs);
};

