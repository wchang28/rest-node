"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var http = require("http");
var https = require("https");
var url_1 = require("url");
var request = require("request");
var _ = require("lodash");
var FormData = require("form-data");
var querystring = require("querystring");
// returns an IError object from an error object of some type
function getIError(error) {
    if (error) {
        if (typeof error.error === 'string' && typeof error.error_description === 'string')
            return error;
        else
            return { error: error.code || error.errno || error.message || 'unknown-error', error_description: error.message || error.errno || error.code || 'unknown error occured' };
    }
    else
        return { error: 'unknown-error', error_description: 'unknown error occured' };
}
// returns an IError object from a HTTP error response body
function getIErrorFromErrorResponse(response, body) {
    var err = null;
    if (typeof body === 'string') {
        try {
            var o = JSON.parse(body); // see if the string is a JSON string
            if (o.error && o.error_description)
                err = o;
            else
                throw 'body is not IError';
        }
        catch (e) {
            err = { error: response.statusMessage, error_description: body };
        }
    }
    else if (!body)
        err = { error: response.statusMessage, error_description: response.statusMessage };
    else {
        if (typeof body.error === 'string' && typeof body.error_description === 'string')
            err = body;
        else {
            var s = JSON.stringify(body);
            err = { error: response.statusMessage, error_description: s ? s : body.toString() };
        }
    }
    return err;
}
// returns true it HTTP returns a "good" status code, false otherwise
// the logic comes from jquery
function goodHTTPStatusCode(statusCode) {
    return ((statusCode >= 200 && statusCode < 300) || (statusCode === 304));
}
function processBody(body) {
    var ret = null;
    if (body) {
        if (typeof body === 'string') {
            try {
                ret = JSON.parse(body); // see if the body is in JSON format, if so parse it
            }
            catch (e) {
                ret = body; // body is not in JSON format
            }
        }
        else
            ret = body;
    }
    return ret;
}
var getRequestCallback = function (done) {
    var callback = function (error, response, body) {
        var err = null;
        var ret = null;
        if (error)
            err = getIError(error);
        else {
            if (!goodHTTPStatusCode(response.statusCode))
                err = getIErrorFromErrorResponse(response, body);
            else
                ret = processBody(body);
        }
        if (typeof done === 'function')
            done(err, (response ? { status: response.statusCode, statusText: response.statusMessage, headers: response.headers, data: ret } : null));
    };
    return callback;
};
function get() {
    var searchString = function (qs) { return (qs && JSON.stringify(qs) != "{}" ? "?" + (typeof qs === "string" ? qs : querystring.stringify(qs)) : ""); };
    var driver = {
        $J: function (method, url, data, options) {
            return new Promise(function (resolve, reject) {
                var opt = {
                    url: url,
                    method: method,
                    headers: {}
                };
                if (data) {
                    if (method.toLowerCase() === 'get')
                        opt.qs = data;
                    else
                        opt.json = data;
                }
                if (options && options.headers)
                    opt.headers = _.assignIn(opt.headers, options.headers);
                if (options && typeof options.rejectUnauthorized === 'boolean')
                    opt.strictSSL = options.rejectUnauthorized;
                request(opt, getRequestCallback(function (err, restReturn) {
                    if (err)
                        reject(err);
                    else
                        resolve(restReturn);
                }));
            });
        },
        $E: function (url, options) {
            return new Promise(function (resolve, reject) {
                var initMsgs = [];
                var EventSource = require('eventsource');
                var eventSourceInitDict = {};
                if (options && options.headers)
                    eventSourceInitDict.headers = options.headers;
                if (options && typeof options.rejectUnauthorized === "boolean") {
                    eventSourceInitDict.https = {
                        rejectUnauthorized: options.rejectUnauthorized
                    };
                }
                var es = new EventSource(url, eventSourceInitDict);
                // It is possible that onmessage() is called BEFORE onopen() for npm package "eventsource". In this case, we must
                // cache all the messages recieved before the onopen() event
                es.onmessage = function (message) {
                    initMsgs.push(message);
                };
                es.onopen = function () {
                    resolve({ eventSrc: es, initMsgs: initMsgs });
                };
                es.onerror = function (err) {
                    es.close();
                    reject(err);
                };
            });
        },
        $F: function (method, url, formData, options) {
            return new Promise(function (resolve, reject) {
                var opt = {
                    url: url,
                    method: method,
                    headers: {}
                };
                if (options && options.headers)
                    opt.headers = _.assignIn(opt.headers, options.headers);
                if (options && typeof options.rejectUnauthorized === 'boolean')
                    opt.strictSSL = options.rejectUnauthorized;
                opt.headers = _.assignIn(opt.headers, formData.getHeaders());
                formData.pipe(request(opt, getRequestCallback(function (err, restReturn) {
                    if (err)
                        reject(err);
                    else
                        resolve(restReturn);
                })));
            });
        },
        $H: function (url, qs, options) {
            return new Promise(function (resolve, reject) {
                var opt = {
                    url: url,
                    method: 'HEAD',
                    headers: {}
                };
                if (qs)
                    opt.qs = qs;
                if (options && options.headers)
                    opt.headers = _.assignIn(opt.headers, options.headers);
                if (options && typeof options.rejectUnauthorized === 'boolean')
                    opt.strictSSL = options.rejectUnauthorized;
                request(opt, getRequestCallback(function (err, restReturn) {
                    if (err)
                        reject(err);
                    else
                        resolve(restReturn);
                }));
            });
        },
        $B: function (url, qs, options) {
            return new Promise(function (resolve, reject) {
                var req = null;
                var callback = function (res) {
                    res.on("error", function (err) {
                        reject(getIError(err));
                    });
                    if (goodHTTPStatusCode(res.statusCode))
                        resolve({ status: res.statusCode, statusText: res.statusMessage, headers: res.headers, data: res });
                    else {
                        res.setEncoding('utf8');
                        var body_1 = '';
                        res.on('data', function (chunk) {
                            body_1 += chunk;
                        });
                        res.on('end', function () {
                            reject(getIErrorFromErrorResponse(res, body_1));
                        });
                    }
                };
                var parsed = url_1.parse(url);
                if (parsed.protocol === 'https:') {
                    var opt = {
                        hostname: parsed.hostname,
                        path: parsed.path + searchString(qs),
                        method: 'GET',
                        headers: {}
                    };
                    if (parsed.port)
                        opt.port = parseInt(parsed.port);
                    if (options && options.headers)
                        opt.headers = _.assignIn(opt.headers, options.headers);
                    if (options && typeof options.rejectUnauthorized === 'boolean')
                        opt.rejectUnauthorized = options.rejectUnauthorized;
                    req = https.request(opt, callback);
                }
                else {
                    var opt = {
                        hostname: parsed.hostname,
                        path: parsed.path + searchString(qs),
                        method: 'GET',
                        headers: {}
                    };
                    if (parsed.port)
                        opt.port = parseInt(parsed.port);
                    if (options && options.headers)
                        opt.headers = _.assignIn(opt.headers, options.headers);
                    req = http.request(opt, callback);
                }
                req.on('error', function (err) {
                    reject(getIError(err));
                }).end();
            });
        },
        $U: function (method, url, readableContent, progressCB, options) {
            return new Promise(function (resolve, reject) {
                var req = null;
                var callback = function (res) {
                    res.on("error", function (err) {
                        reject(getIError(err));
                    });
                    res.setEncoding('utf8');
                    var body = '';
                    res.on('data', function (chunk) {
                        body += chunk;
                    });
                    res.on('end', function () {
                        if (!goodHTTPStatusCode(res.statusCode))
                            reject(getIErrorFromErrorResponse(res, body));
                        else
                            resolve({ status: res.statusCode, statusText: res.statusMessage, headers: res.headers, data: processBody(body) });
                    });
                };
                var contentHeaders = { "Content-Type": readableContent.info.type };
                if (readableContent.info.size)
                    contentHeaders["Content-Length"] = readableContent.info.size.toString();
                var parsed = url_1.parse(url);
                if (parsed.protocol === 'https:') {
                    var opt = {
                        hostname: parsed.hostname,
                        path: parsed.path,
                        method: method,
                        headers: {}
                    };
                    if (parsed.port)
                        opt.port = parseInt(parsed.port);
                    if (options && options.headers)
                        opt.headers = _.assignIn(opt.headers, options.headers);
                    opt.headers = _.assignIn(opt.headers, contentHeaders);
                    if (options && typeof options.rejectUnauthorized === 'boolean')
                        opt.rejectUnauthorized = options.rejectUnauthorized;
                    req = https.request(opt, callback);
                }
                else {
                    var opt = {
                        hostname: parsed.hostname,
                        path: parsed.path,
                        method: method,
                        headers: {}
                    };
                    if (parsed.port)
                        opt.port = parseInt(parsed.port);
                    if (options && options.headers)
                        opt.headers = _.assignIn(opt.headers, options.headers);
                    opt.headers = _.assignIn(opt.headers, contentHeaders);
                    req = http.request(opt, callback);
                }
                req.on('error', function (err) {
                    reject(getIError(err));
                });
                var readable = readableContent.readable;
                readable.on("error", function (err) {
                    reject(getIError(err));
                });
                readable.pipe(req);
            });
        },
        createFormData: function () { return new FormData(); }
    };
    return driver;
}
exports.get = get;
