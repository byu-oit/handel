'use strict';

var warm = false;

exports.handler = function (event, context, callback) {
    console.log('Input', JSON.stringify(event, null, 2));
    console.log('Path', event.path);
    //Echo back the input
    var responseBody = {
        warm: warm,
        request: event,
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