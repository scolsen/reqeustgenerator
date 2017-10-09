
const PS1 = "[requestGenerator] ";

const fs = require('fs');
const request = require('request');
const sp = require('swagger-parser');
let commander = require('commander');

function generateRequest(object){
    let result = {};
    for(let k in object){
        result[k] = resolve(object[k]);
    }
    return JSON.stringify(result);
}

function buildObject(obj, ref, key, fn){
    obj[key] = fn(ref, key);
    return obj;
}

function assembleDate(){
    let now = new Date();
    let time = now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds();
    return now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate() + 'T' + time + 'Z';
}

function checkFormat(input){
    switch(input){
        case 'byte':
            return new Buffer("Sample String").toString('base64');
            break;
        case 'int64':
            return 1064;
            break;
        case 'int32':
            return 1032;
            break;
        case 'date-time':
            return assembleDate();
            break;
        case 'float':
            return 10.10;
            break;
        case 'double':
            return 10.10;
            break;
        case 'binary':
            return "Sample String";
            break;
    }
}

function setSampleString(name){
    switch(name){
        case 'comment':
            return "Sample comment";
            break;
        case 'userName':
            return "Molly Abraham";
            break;
        case 'color':
            return "red";
            break;
        default:
            return "Sample string";
    }
}

function resolve(object, name){
    let result;
    if(!object.hasOwnProperty('type')) return;
    switch(object.type){
        case 'string':
            if(object.hasOwnProperty('enum')){
                return object.enum[0];
            } else {
                let str = setSampleString(name);
                if(object.hasOwnProperty('format')) return checkFormat(object.format);
                return str;
            }
            break;
        case 'integer':
            return 0;
            break;
        case 'number':
            if(object.hasOwnProperty('format')) return checkFormat(object.format);
            return 0;
            break;
        case 'array':
            result = []; //we need to process items as an object as the refs are replaced.
            result.push(resolve(object.items));
            return result;
        case 'boolean':
            return true;
            break;
        case 'object':
            for(let key in object.properties){
                if(commander.minimal && object.hasOwnProperty('required')) {
                    if(object.required.includes(key)) return buildObject({}, resolve(object.properties[key], key));
                } else {
                    return buildObject({}, object.properties[key], key, resolve);
                }
            }
        default:
            return null;
    }
}

function writeFile(content, name){
    let newName = name.replace(/\//g, '-');
    if(!newName.indexOf("-") === 0) newName = "-" + newName;
    let nameStub = "op" + newName + "-" + commander.verb + ".json";
    fs.writeFile(commander.output + "/" + nameStub, content, (err)=>{
        if(err) {
            if(err.code === "ENOENT"){
                console.log(PS1 + "Error: Could not write file: " + nameStub + ". Target directory " + commander.output + " does not exist.");
            } 
            return;
        }
        console.log(PS1 + "Wrote: " + nameStub);
    });   
}

function processEndpoints(api){
   if(commander.args.length < 1){
        console.log(PS1 + "Processing all endpoints");
        for(let key in api.paths){
            if(api.paths[key].hasOwnProperty(commander.verb)){
                api.paths[key].post.parameters.forEach((x)=>{
                    if(x.in !== 'body') return; //if this is not a body parameter, just return.
                    if(!x.hasOwnProperty('schema')) return; //A schema must be defined to generate the request.
                    if(commander.minimal && !x.schema.hasOwnProperty('required')) return;                    
                    writeFile(generateRequest(x.schema.properties), key);
                });
            }
        }
    } else {
        commander.args.forEach((y)=>{
                if(commander.all){
                    for(let key in api.paths){
                        if(key.includes(y) && api.paths[key].hasOwnProperty(commander.verb)){
                            api.paths[key][commander.verb].parameters.forEach((x)=>{
                                writeFile(generateRequest(x.schema.properties), key);
                                if(commander.verbose) console.log(generateRequest(x)); 
                            });
                        }
                    }
                } else {
                    if(!api.paths["/" + y].hasOwnProperty(commander.verb)) return; //if we don't have the target verb as property, do nothing.
                    api.paths["/" + y][commander.verb].parameters.forEach((x)=>{
                        writeFile(generateRequest(x.schema.properties), y);
                        if(commander.verbose) console.log(generateRequest(x)); 
                    });
                }
        });
    } 
}

// Main //

commander
    .version("1.0.0")
    .option('-u, --url <url>', 'Swagger source URL')
    .option('-p --proxy <proxy>', 'Proxy URL')
    .option('-v --verb [verb]', 'HTTP verb to generate examples for.', 'post')
    .option('-o --output [folder]', 'Folder to save results to.', '.')
    .option('-m --minimal', 'Generate requests containing required fields only')
    .option('--verbose', 'Output results to the console')
    .option('-a --all', 'Generate examples for all endpoints containing the argument strings')
    .parse(process.argv);

console.log(PS1 + "Fetching swagger file from URL: " + commander.url);
console.log(PS1 + "Saving results to file: " + commander.file);
console.log(PS1 + "Generating examples for the following endpoints: ");
commander.args.forEach((x)=>{
    console.log(x);
});

request({url: commander.url, proxy: commander.proxy}, (error, response, body)=>{
    sp.dereference(JSON.parse(body)).then((api)=>{
        processEndpoints(api);     
    });
});


