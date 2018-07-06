'use strict';

var warm = false;

exports.handler = function (event, context, callback) {
    //Echo back the input
    var responseBody = {
        request: event,
        warm: warm
    };
    warm = true;
    var response = {
        statusCode: 200,
        headers: {
            "x-custom-header" : "my custom header value"
        },
        body: JSON.stringify(responseBody)
    };
    console.log("Hello 1!");
    console.log("response: " + JSON.stringify(response));
    callback(null, response);
};