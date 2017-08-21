var app = require('express')();

app.get('/', function(req, res) {
    res.send("Hello World!");
});

var port = process.env.PORT || 3000;
app.listen(port, function () {
    console.log('Server running at http://127.0.0.1:' + port + '/');
});