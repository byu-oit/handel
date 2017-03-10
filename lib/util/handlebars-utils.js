const handlebars = require('handlebars');
const fs = require('fs');

/**
 * Given a handlebars template filename and a Javascript object of the variables
 * to inject in that template, compiles and returns the template
 * 
 * @param {String} filename - The full path of the template file on disk to read 
 * @param {Object} variables - A Javascript object containing the variables to be used by Handlebars for the template
 * @returns {String} - The finished template with variables replaced
 */
exports.compileTemplate = function(filename, variables) {
    //TODO - This doesn't handle errors yet
    return new Promise((resolve, reject) => {
        fs.readFile(filename, 'utf-8', function(error, source) {
            //Register any helpers we need
            let template = handlebars.compile(source);
            let output = template(variables);
            resolve(output);
        });
    });
}