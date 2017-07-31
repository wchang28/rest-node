import {IError, ApiCallOptions, HTTPMethod, RESTReturn, ContentInfo} from 'rest-api-interfaces';
import * as eventSource from 'eventsource-typings';
import * as $dr from 'rest-driver';
import * as http from 'http';
import * as https from 'https';
import {parse as parseUrl} from 'url';
import * as request from 'request';
import * as _ from 'lodash';
import * as FormData from 'form-data';
import {Readable} from 'stream';
import * as querystring from "querystring";
export * from 'rest-driver';

// returns an IError object from an error object of some type
function getIError(error:any): IError {
    if (error) {
        if (typeof error.error === 'string' && typeof error.error_description === 'string')
            return error;
        else
            return {error: error.code||error.errno||error.message||'unknown-error', error_description: error.message||error.errno||error.code||'unknown error occured'};
    } else
        return {error: 'unknown-error', error_description: 'unknown error occured'};
}

// returns an IError object from a HTTP error response body
function getIErrorFromErrorResponse(response: http.IncomingMessage, body: any): IError {
    let err:IError = null;
    if (typeof body === 'string') {   // body is a string
        try {
            let o = JSON.parse(body);   // see if the string is a JSON string
            if (o.error && o.error_description)
                err = o;
            else
                throw 'body is not IError';
        } catch (e) {
            err = {error: response.statusMessage, error_description:body};
        }
    } else if (!body) // body is null or undefined
        err = {error: response.statusMessage, error_description: response.statusMessage};
    else {  // body is already an object
        if (typeof body.error === 'string' && typeof body.error_description === 'string')
            err = body;
        else {
            let s = JSON.stringify(body);
            err = {error: response.statusMessage, error_description: s ? s: body.toString()};
        }
    }
    return err;
}

// returns true it HTTP returns a "good" status code, false otherwise
// the logic comes from jquery
function goodHTTPStatusCode(statusCode: number) : boolean {
    return ((statusCode >= 200 && statusCode < 300) || (statusCode === 304)); 
}

function processBody(body: any) : any {
    let ret:any = null;
    if (body) {
        if (typeof body === 'string') { // body is a string
            try {
                ret = JSON.parse(body); // see if the body is in JSON format, if so parse it
            } catch(e) {
                ret = body; // body is not in JSON format
            }
        } else  // body ios not a string
            ret = body;       
    }
    return ret;
}

let getRequestCallback = (done:(err: IError, restReturn: RESTReturn) => void) : request.RequestCallback => {
    let callback = (error: any, response: http.IncomingMessage, body: any) => {
        let err:IError = null;
        let ret:any = null;
        if (error)  // there is error
            err = getIError(error);
        else {
            if (!goodHTTPStatusCode(response.statusCode))   // bad status code return
                err = getIErrorFromErrorResponse(response, body);
            else    // good status code return
                ret = processBody(body);
        }
        if (typeof done === 'function') done(err, (response ? {status: response.statusCode, statusText: response.statusMessage, headers: response.headers, data: ret} : null));
    };
    return callback;
}

export function get() : $dr.$Driver {
    let searchString = (qs: any) : string => (qs && JSON.stringify(qs) != "{}" ? "?" + (typeof qs === "string" ? qs: querystring.stringify(qs)) : ""); 
    let driver:$dr.$Driver  = {
        $J: (method: HTTPMethod, url:string, data:any, options?: ApiCallOptions) : Promise<RESTReturn> => {
            return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject:(err: any) => void) => {
                let opt: request.Options = {
                    url
                    ,method
                    ,headers: {}
                };
                if (data) {
                    if (method.toLowerCase() === 'get')
                        opt.qs = data;
                    else
                        opt.json = data;
                }
                if (options && options.headers) opt.headers = _.assignIn(opt.headers, options.headers);
                if (options && typeof options.rejectUnauthorized === 'boolean') opt.strictSSL = options.rejectUnauthorized;
                request(opt, getRequestCallback((err: IError, restReturn: RESTReturn) => {
                    if (err)
                        reject(err);
                    else
                        resolve(restReturn);
                }));
            });
        }
        ,$E: (url: string, options?:ApiCallOptions) : Promise<$dr.I$EReturn> => {
            return new Promise<$dr.I$EReturn>((resolve: (value: $dr.I$EReturn) => void, reject:(err: any) => void) => {
                let initMsgs: eventSource.Message[] = [];
                let EventSource: eventSource.EventSourceConstructor = require('eventsource');
                let eventSourceInitDict: eventSource.InitDict = {};
                if (options && options.headers) eventSourceInitDict.headers = options.headers;
                if (options && typeof options.rejectUnauthorized === "boolean") {
                    eventSourceInitDict.https = {
                        rejectUnauthorized: options.rejectUnauthorized
                    };
                }
                let es: eventSource.IEventSource = new EventSource(url, eventSourceInitDict);
                // It is possible that onmessage() is called BEFORE onopen() for npm package "eventsource". In this case, we must
                // cache all the messages recieved before the onopen() event
                es.onmessage = (message: eventSource.Message) => {
                    initMsgs.push(message);
                };
                es.onopen = () => {
                    resolve({eventSrc: es, initMsgs});
                }
                es.onerror = (err: eventSource.Error) => {
                    es.close();
                    reject(err);
                };
            });
        }
        ,$F: (method: HTTPMethod, url:string, formData:FormData, options?: ApiCallOptions) : Promise<RESTReturn> => {
            return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject:(err: any) => void) => {
                let opt: request.Options = {
                    url
                    ,method
                    ,headers: {}
                };
                if (options && options.headers) opt.headers = _.assignIn(opt.headers, options.headers);
                if (options && typeof options.rejectUnauthorized === 'boolean') opt.strictSSL = options.rejectUnauthorized;
                opt.headers = _.assignIn(opt.headers, formData.getHeaders());
                formData.pipe(request(opt, getRequestCallback((err: IError, restReturn: RESTReturn) => {
                    if (err)
                        reject(err);
                    else
                        resolve(restReturn);
                })));
            });
        }
        ,$H: (url:string, qs?: any, options?: ApiCallOptions) : Promise<RESTReturn> => {
            return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject:(err: any) => void) => {
                let opt: request.Options = {
                    url
                    ,method:'HEAD'
                    ,headers: {}
                };
                if (qs) opt.qs = qs;
                if (options && options.headers) opt.headers = _.assignIn(opt.headers, options.headers);
                if (options && typeof options.rejectUnauthorized === 'boolean') opt.strictSSL = options.rejectUnauthorized;
                request(opt, getRequestCallback((err: IError, restReturn: RESTReturn) => {
                    if (err)
                        reject(err);
                    else
                        resolve(restReturn);
                }));
            });
        }
        ,$B: (url:string, qs?: any, options?: ApiCallOptions) : Promise<RESTReturn> => {
            return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject:(err: any) => void) => {
                let req: http.ClientRequest = null;
                let callback = (res: http.IncomingMessage) => {
                    res.on("error", (err: Error) => {
                        reject(getIError(err));
                    });
                    if (goodHTTPStatusCode(res.statusCode))
                        resolve({status: res.statusCode, statusText: res.statusMessage, headers: res.headers, data: res});
                    else {
                        res.setEncoding('utf8');
                        let body = '';
                        res.on('data', (chunk:string) => {
                            body += chunk;
                        });
                        res.on('end', () => {
                            reject(getIErrorFromErrorResponse(res, body));
                        });
                    }
                };
                let parsed = parseUrl(url);
                if (parsed.protocol === 'https:') {
                    let opt: https.RequestOptions = {
                        hostname: parsed.hostname,
                        path: parsed.path + searchString(qs),
                        method: 'GET',
                        headers: {}
                    };
                    if (parsed.port) opt.port = parseInt(parsed.port);
                    if (options && options.headers) opt.headers = _.assignIn(opt.headers, options.headers);
                    if (options && typeof options.rejectUnauthorized === 'boolean') opt.rejectUnauthorized = options.rejectUnauthorized;
                    req = https.request(opt, callback);
                } else {
                    let opt: http.RequestOptions = {
                        hostname: parsed.hostname,
                        path: parsed.path + searchString(qs),
                        method: 'GET',
                        headers: {}
                    };
                    if (parsed.port) opt.port = parseInt(parsed.port);
                    if (options && options.headers) opt.headers = _.assignIn(opt.headers, options.headers);
                    req = http.request(opt, callback);
                }
                req.on('error', (err: Error) => {
                    reject(getIError(err));
                }).end();
            });
        }
        /*
        ,$U: (method: HTTPMethod, url:string, readableContent: $dr.ReadableContent<Readable>, options?: ApiCallOptions) : Promise<RESTReturn> => {
            return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject:(err: any) => void) => {
                let opt: request.Options = {
                    url
                    ,method
                    ,headers: {}
                };
                if (options && options.headers) opt.headers = _.assignIn(opt.headers, options.headers);
                if (options && typeof options.rejectUnauthorized === 'boolean') opt.strictSSL = options.rejectUnauthorized;
                let contentHeaders = {"Content-Type": readableContent.info.type};
                if (readableContent.info.size) contentHeaders["Content-Length"] = readableContent.info.size.toString();
                opt.headers = _.assignIn(opt.headers, contentHeaders);
                readableContent.readable.pipe(request(opt, getRequestCallback((err: IError, restReturn: RESTReturn) => {
                    if (err)
                        reject(err);
                    else
                        resolve(restReturn);
                })));
            });
        }
        */
        ,$U: (method: HTTPMethod, url:string, readableContent: $dr.ReadableContent<Readable>, options?: ApiCallOptions) : Promise<RESTReturn> => {
            return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject:(err: any) => void) => {
                let req: http.ClientRequest = null;
                let callback = (res: http.IncomingMessage) => {
                    res.on("error", (err: Error) => {
                        reject(getIError(err));
                    });
                    res.setEncoding('utf8');
                    let body = '';
                    res.on('data', (chunk:string) => {
                        body += chunk;
                    });
                    res.on('end', () => {
                        if (!goodHTTPStatusCode(res.statusCode))   // bad status code return
                            reject(getIErrorFromErrorResponse(res, body));
                        else {    // good status code return
                            let ret = processBody(body);
                            resolve({status: res.statusCode, statusText: res.statusMessage, headers: res.headers, data: ret});
                        }
                    });
                };
                let contentHeaders: any = {"Content-Type": readableContent.info.type};
                if (readableContent.info.size) contentHeaders["Content-Length"] = readableContent.info.size.toString();
                let parsed = parseUrl(url);
                if (parsed.protocol === 'https:') {
                    let opt: https.RequestOptions = {
                        hostname: parsed.hostname,
                        path: parsed.path,
                        method: 'GET',
                        headers: {}
                    };
                    if (parsed.port) opt.port = parseInt(parsed.port);
                    if (options && options.headers) opt.headers = _.assignIn(opt.headers, options.headers, contentHeaders);
                    if (options && typeof options.rejectUnauthorized === 'boolean') opt.rejectUnauthorized = options.rejectUnauthorized;
                    opt.headers = _.assignIn(opt.headers, contentHeaders);
                    req = https.request(opt, callback);
                } else {
                    let opt: http.RequestOptions = {
                        hostname: parsed.hostname,
                        path: parsed.path,
                        method: 'GET',
                        headers: {}
                    };
                    if (parsed.port) opt.port = parseInt(parsed.port);
                    if (options && options.headers) opt.headers = _.assignIn(opt.headers, options.headers, contentHeaders);
                    req = http.request(opt, callback);
                }
                req.on('error', (err: Error) => {
                    reject(getIError(err));
                });
                let readable = readableContent.readable;
                readable.on("error", (err: Error) => {
                    reject(getIError(err));
                })
                readable.pipe(req);
            });
        }
        ,createFormData: () : FormData => { return new FormData();}
    }
    return driver;
}