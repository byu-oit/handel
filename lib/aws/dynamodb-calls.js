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

exports.tagTable = function (tableARN, tags) {
    let dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

    let params = {
        ResourceArn: tableARN,
        Tags: buildTagList(tags)
    };
    return dynamodb.tagResource(params).promise();
}

function buildTagList(tags) {
    let dynamoTags = []
    for (let tagName in tags) {
        dynamoTags.push({
            Key: tagName,
            Value: tags[tagName]
        })
    }
    return dynamoTags
}