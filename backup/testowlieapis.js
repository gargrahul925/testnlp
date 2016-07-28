require('./dbfunctions.js')();
require('./helper.js')();
var Hapi = require('hapi');
var fs = require('fs');
var multiparty = require('multiparty');
var shortid = require('shortid');
var Basic = require('hapi-auth-basic');
var Inert = require('inert');
var Path = require('path');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var ObjectId = require('mongodb').ObjectID;
var http = require('http');
var url = require('url');
var requester = require('request');
var StanfordSimpleNLP = require('stanford-simple-nlp');
var csNodeCache = require('cache-service-node-cache');
var nodeCache = new csNodeCache();
var googleImages = require('google-images');
var client = googleImages('006237153096981378593:3prpuc6kgts', 'AIzaSyA8EqoLls3295vB6YptRoE2LlcuE4bOgp8');
var is_nlp_allowed = false;

if (process.argv.length != 4) {
    console.log("Error : Pass 2 arguments : Collection Name and Port To Use");
    process.exit();
}
else {
    var mongoURL = 'mongodb://localhost:27017/' + process.argv[2];

    var stanfordSimpleNLP = new StanfordSimpleNLP.StanfordSimpleNLP(function (err) {
        if (!err)
            is_nlp_allowed = true;
    });

    MongoClient.connect(mongoURL, function (err, db) {
        assert.equal(null, err);

        var server = new Hapi.Server();
        server.connection({
            host: '0.0.0.0',
            port: process.argv[3],
            routes: {
                cors: true,
                files: {
                    relativeTo: Path.join(__dirname, 'public')
                }
            }
        });

        var users = {
            devel: {
                username: 'devel',
                password: 'anandsentme', // 'secret'
            }
        };

        var validate = function (request, username, password, retFunc) {
            var user = users[username];
            if (!user) {
                return retFunc(null, false);
            }
            if (password === user.password && username === user.username)
                retFunc(null, true, {
                    status: "OK"
                });
            else
                retFunc(null, false, {
                    status: "ERROR"
                });
        };

        server.register(Inert, function () { });

        server.register(Basic, function (err) {
            server.auth.strategy('simple', 'basic', {
                validateFunc: validate
            });
            server.route({
                method: 'POST',
                path: '/owlie/uploadfiles',
                config: {
                    auth: 'simple',
                    payload: {
                        maxBytes: 209715200,
                        output: 'stream',
                        parse: false
                    },
                    handler: function (req, reply) {
                        var form = new multiparty.Form();

                        form.parse(req.payload, function (err, fields, files) {

                            if (files != undefined) {
                                console.log(files);
                                var keys = Object.keys(files);
                                var replyData = "";
                                var count = 0;
                                for (var i = 0; i < keys.length; i++) {
                                    fs.readFile(files[keys[i]][0].path, function (err, data) {
                                        var uuid1 = shortid.generate();
                                        var newpath = __dirname + "/public/owlie/" + uuid1 + ".jpeg";
                                        fs.writeFile(newpath, data, function (err) {
                                            count++;
                                            if (err) {
                                                replyData = ({ "status": -1, "error": 100, "msg": "Error Uploading File" });
                                                reply(replyData);
                                                return;
                                            } else {
                                                replyData += (uuid1 + ".jpeg");
                                                if (count == keys.length) {
                                                    reply({ "status": 1, "data": returnVal });
                                                } else {
                                                    replyData += "#";
                                                }
                                            }
                                        })
                                    });
                                }
                            }
                            else {
                                reply({ "status": -1, "error": "101" });
                            }

                        });
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/download_fb_pic',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {

                        var picurl = request.payload.picurl;
                        var user_id = request.payload.user_id ? request.payload.user_id : "";
                        if (picurl != undefined && user_id != "") {
                            url = url.parse(decodeURIComponent(picurl));


                            var options = {
                                host: url.hostname,
                                port: 80,
                                path: url.path
                            };

                            http.get(options, function (res) {
                                if (res.statusCode == 200) {
                                    var newpath = __dirname + "/public/owlie/" + user_id + ".png";
                                    console.log(newpath);
                                    res.setEncoding('binary')
                                    var imagedata = ''
                                    res.on('data', function (chunk) {
                                        imagedata += chunk;
                                    });
                                    res.on('end', function () {
                                        fs.writeFile(newpath, imagedata, 'binary', function (err) {
                                            if (err)
                                                reply({ "status": -1, "error": "121", "msg": "Error Uploading File" });
                                            else {

                                                reply({ "status": 1, "data": user_id + ".jpeg" });
                                            }

                                        });
                                    });
                                } else {
                                    reply({ "status": -1, "error": "122", "msg": "response returned " + res.statusCode });
                                }
                            }).on('error', function (e) {
                                reply({ "status": -1, "error": "123", "msg": e.message });
                            });
                        }

                        else {
                            reply({ "status": -1, "error": "102" });
                        }
                    }
                }
            });

            server.route({
                method: 'GET',
                path: '/owlie/getPicture',
                handler: function (request, reply) {
                    var name = request.query.name ? request.query.name : "";
                    console.log(name);
                    if (name != "") {
                        reply.file(__dirname + "/public/owlie/" + name);
                    } else {
                        reply({ "status": -1, "error": "103" });
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/registerUser',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var fb_user_id = request.payload.fb_user_id ? request.payload.fb_user_id : "";
                        var user_name = request.payload.user_name ? request.payload.user_name : "";
                        var profile_pic = request.payload.profile_pic ? request.payload.profile_pic : "default.jpeg";

                        if (fb_user_id != "" && user_name != "") {
                            registerUser(db, fb_user_id, user_name, profile_pic, function (returnVal, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }

                            });
                        } else {
                            reply({ "status": -1, "error": "104" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/registerToken',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var user_id = request.payload.user_id ? request.payload.user_id : "";
                        var token = request.payload.token ? request.payload.token : "default.jpeg";

                        if (token != "" && user_id != "") {
                            registerToken(db, user_id, token, function (returnVal, err) {

                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "105" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/getUser',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var fb_user_id = request.payload.fb_user_id ? request.payload.fb_user_id : "";
                        if (fb_user_id != "") {
                            getUserInfo(db, fb_user_id, function (returnVal, err) {

                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }

                            });
                        } else {
                            reply({ "status": -1, "error": "106" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/createPoll',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var who_id = request.payload.who_id ? request.payload.who_id : "";
                        var back_image = request.payload.back_image ? request.payload.back_image : null;
                        var launch_time = (new Date()).getTime();
                        var question_data = request.payload.question_data ? request.payload.question_data : "";
                        var options_data = request.payload.options_data ? request.payload.options_data : "";
                        var timer_value = request.payload.timer_value ? request.payload.timer_value : "";
                        var prev_poll = request.payload.prev_poll ? request.payload.prev_poll : "";
                        var story_caption = request.payload.story_caption ? request.payload.story_caption : "";
                        var isMultiSelect = request.payload.isMultiSelect ? parseInt(request.payload.isMultiSelect) : 0;


                        var poll_id = shortid.generate();
                        if (who_id != "" && back_image != null && question_data != "" && options_data != "" && IsJsonString(question_data.replace("\\\"", "\"")) && IsJsonString(options_data.replace("\\\"", "\""))) {
                            createPoll(db, poll_id, who_id, back_image, launch_time, JSON.parse(question_data.replace("\\\"", "\"")), JSON.parse(options_data.replace("\\\"", "\"")), timer_value, prev_poll, story_caption, isMultiSelect, function (returnVal, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "107" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/closePoll',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                        var user_id = request.payload.user_id ? request.payload.user_id : "";
                        var caption = request.payload.caption ? request.payload.caption : "";

                        if (poll_id != "" && user_id != "") {
                            closePoll(db, poll_id, user_id, caption, function (returnVal, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "108" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/deletePoll',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                        var user_id = request.payload.user_id ? request.payload.user_id : "";
                        if (poll_id != "" && user_id != "") {
                            deletePoll(db, poll_id, user_id, function (returnVal, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "109" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/retrievePoll',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                        var user_id = request.payload.user_id ? request.payload.user_id : "";

                        if (poll_id != "" && user_id != "") {
                            retrievePoll(db, poll_id, user_id, function (returnVal, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "110" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/answerPoll',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                        var user_id = request.payload.user_id ? request.payload.user_id : "";
                        var answer = request.payload.answer ? request.payload.answer : "";

                        if (poll_id != "" && user_id != "") {
                            answerPoll(db, poll_id, user_id, answer, function (returnVal, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "111" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/addParticipant',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                        var part_ids = request.payload.part_ids ? request.payload.part_ids : "";

                        if (poll_id != "" && part_ids != "") {
                            addParticipant(db, poll_id, part_ids, function (returnVal, err) {
                                if (!err)
                                    reply({ "status": 1, "data": returnVal });
                                else
                                    reply(returnVal);
                            });
                        } else {
                            reply({ "status": -1, "error": "112" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/addComment',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                        var user_id = request.payload.user_id ? request.payload.user_id : "";
                        var comment = request.payload.comment ? request.payload.comment : "";

                        if (poll_id != "" && user_id != "" && comment != "") {
                            addComment(db, poll_id, user_id, comment, function (returnVal, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "112" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/retrievePollsByUserID',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var user_id = request.payload.user_id ? request.payload.user_id : "";

                        if (user_id != "") {
                            retrievePollsByUserID(db, user_id, function (returnVal, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "113" })
                        }
                    }
                }
            });


            server.route({
                method: 'POST',
                path: '/owlie/fetchCommentsResults',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";

                        if (poll_id != "") {
                            fetchCommentsResults(db, poll_id, 0, function (returnVal, index, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "114" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/retrieveNestedPollChain',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";

                        if (poll_id != "") {
                            retrieveNestedPollChain(db, poll_id, function (returnVal, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "115" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/pokeForPoll',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                        var user_id = request.payload.user_id ? request.payload.user_id : "";
                        var story_caption = request.payload.story_caption ? request.payload.story_caption : "";

                        if (poll_id != "" && user_id != "") {
                            pokeForPoll(db, poll_id, user_id, story_caption, function (returnVal, index, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "116" })
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/addOption',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                        var option_data = request.payload.option_data ? request.payload.option_data : "";
                        var user_id = request.payload.user_id ? request.payload.user_id : "";
                        var user_name = request.payload.user_name ? request.payload.user_name : "";

                        if (poll_id != "" && option_data != "" && user_id != "" && user_name != "") {
                            addOption(db, poll_id, user_id, user_name, option_data, function (returnVal, index, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "117" });
                        }
                    }
                }
            });

            server.route({
                method: 'POST',
                path: '/owlie/summarizePoll',
                config: {
                    auth: 'simple',
                    handler: function (request, reply) {
                        var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                        var user_id = request.payload.user_id ? request.payload.user_id : "";

                        if (poll_id != "" && user_id != "") {
                            summarizePoll(db, poll_id, user_id, function (returnVal, index, err) {
                                if (!err) {
                                    reply({ "status": 1, "data": returnVal });

                                }
                                else {
                                    reply(returnVal);
                                }
                            });
                        } else {
                            reply({ "status": -1, "error": "118" });
                        }
                    }
                }
            });

            server.route({
                method: 'GET',
                path: '/owlie/fetchContextualImage',
                config: {
                    auth: 'simple',
                    handler: function(request, reply) {
                        var text = request.query.text ? request.query.text : "";
                            
                        if (text != "" && is_nlp_allowed) {
                            stanfordSimpleNLP.process(text, function(err, result) {
                                var tokens=[];
                                var inpSentences=result.document.sentences.sentence;
                                if (!(inpSentences instanceof Array))
                                {
                                    tokens = inpSentences.tokens.token;
                                }
                                else
                                {
                                    for (var i=0;i<inpSentences.length;i++)
                                     {
                                        tokens=tokens.concat(inpSentences[i].tokens.token)
                                     }
                                }
                                 
                                var phrase = "";
                                
                                if (typeof(tokens.length) == "undefined") {
                                    if (tokens.POS.lastIndexOf('NN', 0) === 0) {
                                        phrase += tokens.word + " ";
                                    }
                                } else {
                                    for (var k = 0; k < tokens.length; k++) {
                                        if (tokens[k].POS.lastIndexOf('NN', 0) === 0) {
                                            phrase += tokens[k].word + " ";
                                        }

                                    }
                                }
                                    
                                    phrase = phrase.trim();
                                   
                                    if (phrase != "") {
                                        var data_to_return = '{"Error":101}';
                                        client.search(phrase).then(function(images) {
                                            if (images != null) {
                                                data_to_return = JSON.stringify(images);
                                            }
                                            reply({ "status": 1, "data": {"image":data_to_return,"phrase":phrase} });
                                        });
                                    } else {
                                        reply({ "status": -1, "error": 128 });
                                    }
                                
                            });
			    }
                            else {
                                reply({ "status": -1, "error": 119 });
                    }
                }
            }
        });


    server.route({
        method: 'DELETE',
        path: '/owlie/clearDatabase',
        config: {
            auth: 'simple',
            handler: function (request, reply) {
                clearDatabase(db, function (returnVal) {
                    reply({ "status": 1});
                });
            }
        }
    });

    server.route({
        method: 'POST',
        path: '/owlie/changeStoryCaption',
        config: {
            auth: 'simple',
            handler: function (request, reply) {
                var poll_id = request.payload.poll_id ? request.payload.poll_id : "";
                var new_caption = request.payload.new_caption ? request.payload.new_caption : "";
                var old_caption = request.payload.old_caption ? request.payload.old_caption : "";
                var user_id = request.payload.user_id ? request.payload.user_id : "";

                if (poll_id != "" && new_caption != "" && user_id != "") {
                    changeStoryCaption(db, poll_id, user_id, old_caption, new_caption, function (returnVal, index, err) {
                        if (!err) {
                            reply({ "status": 1, "data": returnVal });

                        }
                        else {
                            reply(returnVal);
                        }
                    });
                } else {
                    reply({ "status": -1, "error": "120" });
                }
            }
        }
    });

    server.start(function () {
        console.log('Owlie running at: ' + server.info.uri);
    });
});
});
}
