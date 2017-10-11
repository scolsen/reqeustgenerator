#!/usr/bin/env node
const PS1 = "[requestGenerator] ";

const fs = require('fs');
const request = require('request');
const sp = require('swagger-parser');
const beautify = require('json-beautify');
let commander = require('commander');

function generateRequest(object){
    let result = {};
    for(let k in object){
        result[k] = resolve(object[k], k);
    }
    return beautify(result, null, 2, 80);
}

function buildObject(obj, ref, key, fn){
    for(let k in ref){
         if(ref[k].type !== 'object') obj[k] = fn(ref[k]);
    }
    return obj;
}

function assembleDate(){
    let now = new Date();
    let time = now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds();
    return now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate() + 'T' + time + 'Z';
}

function checkFormat(input, name){
    if(name !== undefined && name === 'week' || name === 'dayOfMonth' || name === 'dayOfWeek' || name === 'month'){
        return 2;
    }
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
        case 'websiteUrl':
            return "http://example.com";
            break;
        default:
            if(name !== undefined) return "sample" + name.charAt(0).toUpperCase() + name.slice(1);
            return "sampleString";
    }
}

function resolve(object, name){
    let result;
    if(!object.hasOwnProperty('type')) return;
    if(name !== undefined && name === "updateDate") return;
    switch(object.type){
        case 'string':
            if(object.hasOwnProperty('enum')){
                if(object.enum[0].includes("Length[")){
                    let str = setSampleString(name); 
                    return str;
                }
                return object.enum[0];
            } else {
                let str = setSampleString(name);
                if(object.hasOwnProperty('format')) return checkFormat(object.format, name);
                return str;
            }
            break;
        case 'integer':
            if(name !== undefined && name.endsWith('Id')) return 101;
            if(object.hasOwnProperty('format')) return checkFormat(object.format, name);
            return 10;
            break;
        case 'number':
            if(object.hasOwnProperty('format')) return checkFormat(object.format, name);
            return 10;
            break;
        case 'array':
            result = []; //we need to process items as an object as the refs are replaced.
            result.push(resolve(object.items));
            return result;
        case 'boolean':
            return true;
            break;
        case 'object':
            let obj = {};
            if(!object.hasOwnProperty('properties')) return {};
            for(let key in object.properties){
                if(commander.minimal && object.hasOwnProperty('required')) {
                    if(object.required.includes(key)) return buildObject(obj, object.properties, key, resolve);
                } else {
                    return buildObject(obj, object.properties, key, resolve);
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
               if(!api.paths[key][commander.verb].hasOwnProperty('parameters')) return;
               api.paths[key][commander.verb].parameters.forEach((x)=>{
                    if(x.in !== 'body') return; //if this is not a body parameter, just return.
                    if(!x.hasOwnProperty('schema')) return; //A schema must be defined to generate the request.
                    if(commander.minimal && !x.schema.hasOwnProperty('required')) return;                    
                    if(x.schema.hasOwnProperty('properties')){
                        writeFile(generateRequest(x.schema.properties), key);
                    } else if (x.schema.hasOwnProperty('items')){
                        writeFile(JSON.stringify(resolve(x.schema)), key);
                    }
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
console.log(PS1 + "Saving results to folder: " + commander.output);
console.log(PS1 + "Generating examples for the following endpoints: ");
commander.args.forEach((x)=>{
    console.log(x);
});

request({url: commander.url, proxy: commander.proxy}, (error, response, body)=>{
    sp.dereference(JSON.parse(body)).then((api)=>{
        processEndpoints(api);     
    });
});


