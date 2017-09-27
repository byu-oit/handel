'use strict';

exports.handler = function (event, context, callback) {
    //Just respond Hello World to all the paths for this example.
    var responseBody = {
        message: "Hello 1!"
    };
    var response = {
        statusCode: 200,
        headers: {
            "x-custom-header" : "my custom header value"
        },
        body: JSON.stringify(responseBody)
    };
    console.log("Hello 1!");
    console.log("response: " + JSON.stringify(response))
    callback(null, response);
};