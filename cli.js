#!/usr/bin/env nodes
var request = require('request')
var argv = require('yargs').argv
var clc = require('cli-color')
var deepSort = require('deep-sort')

//colors... oh ya...
var error = clc.red.bold;
var warn = clc.yellow;
var notice = clc.blue;

//validate required args
if(!argv.client_id) {
    console.error(error('Missing --client_id argument. This is your Stackpath client ID for the API.'));
    return;
}

if(argv.client_secret === undefined) {
    console.error(error('Missing --client_secret argument. This is your Stackpath cilent secret for the API.'));
    return;
}

if(argv.start_date === undefined) {
    console.error(error('Missing --start_date argument. Example: 2020-11-15T00:00:00Z.'));
    return;
}

if(argv.end_date === undefined) {
    console.error(error('Missing --end_date argument. Example: 2020-11-30T00:00:00Z'));
    return;
}

if(argv.stack_id === undefined) {
    console.error(error('Missing --stack_id argument. Example: agilitycms-cloud-sites-d2caf6'))
    return;
}


//default options
var options = {
    client_id: null,
    client_secret: null,
    start_date: null,
    end_date: null,
    stack_id: null,
    take: 100
}

//overwrite defaults
options = {...options, ...argv};

var getAuthToken = function(cb) {
    request({
        method: 'POST',
        uri: `https://gateway.stackpath.com/identity/v1/oauth2/token`,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: {
            grant_type: 'client_credentials',
            client_id: options.client_id,
            client_secret: options.client_secret
        },
        json: true,
    }, function(errorObj, response, body) {
        if(errorObj) {
            console.log(error(errorObj));
            return;
        } 
        if(response && response.statusCode) {
            console.log(notice('Successfully received auth token from Stackpath...'))
            console.log(body);
            console.log(body.access_token)
            cb(body.access_token);
        }
    });
}

var getMetrics = function(processMetrics) {
    getAuthToken(function(access_token) {
        //make the request to get metrics
        console.log(notice('Getting metrics from Stackpath...'))
        request({
            method: 'GET',
            uri: `https://gateway.stackpath.com/delivery/v1/stacks/${options.stack_id}/metrics?metric_type=TRANSFER&granularity=P1M&platforms=CDE&group_by=SITE&start_date=${options.start_date}&end_date=${options.end_date}`,
            body: null,
            json: true,
            auth: {
                bearer: access_token
            }
        }, function(errorObj, response, body) {
            if(errorObj) {
                console.error(error(errorObj));
                return;
            } 
            if(response.statusCode === 400) {
                console.error("400 error");
                return;
            }
            if(response && response.statusCode) {
                console.log(response.statusCode);
                console.log(notice('Got results from Stackpath, formatting...'))
                processMetrics(body);
            }
        });
    })
    
}

//GO!
getMetrics(function(response) {

    var results = {
        totalBandwidthMB: null,
        totalSites: null,
        sites: [],
    }
   
    

    for(var i in response.data.matrix.results) {
        var thisResult = response.data.matrix.results[i];
        if(thisResult.metric.__name__ === 'transfer_used_total_mb') {
            var bandwidthForThisSite = (thisResult.values.length > 0 ? parseFloat(thisResult.values[0].value) : 0); //TODO: handle multiple value ouputs for a time range
            results.sites.push({
                 bandwidthMB: bandwidthForThisSite,
                 site_id: thisResult.metric.site_id,
                 url: `https://control.stackpath.com/stacks/${options.stack_id}/sites/${thisResult.metric.site_id}/overview`
                });
            results.totalBandwidthMB += bandwidthForThisSite;
            results.totalSites ++;
        }
    }

    results.sites = results.sites.sort(function(a,b) {
        if(a.bandwidthMB < b.bandwidthMB) return 1;
        if(a.bandwidthMB > b.bandwidthMB) return -1;
        return 0;
    })

    results.sites = results.sites.slice(0, options.take);


    console.log(results);
})


