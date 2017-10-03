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

exports.getDbSubnetGroup = function (subnetGroupName) {
    const rds = new AWS.RDS({ apiVersion: '2014-10-31' });

    var describeParams = {
        DBSubnetGroupName: subnetGroupName
    };
    return rds.describeDBSubnetGroups(describeParams).promise()
        .then(describeResponse => {
            return describeResponse.DBSubnetGroups[0];
        })
        .catch(err => {
            if(err.code === 'DBSubnetGroupNotFoundFault') {
                return null;
            }
            else {
                throw err;
            }
        });
}

exports.createDbSubnetGroup = function (subnetGroupName, dbGroupSubnetIds) {
    const rds = new AWS.RDS({ apiVersion: '2014-10-31' });

    var createParams = {
        DBSubnetGroupDescription: 'Handel-created subnet group for Default VPC',
        DBSubnetGroupName: subnetGroupName,
        SubnetIds: dbGroupSubnetIds,
    };
    return rds.createDBSubnetGroup(createParams).promise()
        .then(createResponse => {
            return createResponse.DBSubnetGroup;
        });
}