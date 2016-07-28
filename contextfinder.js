var Hapi = require('hapi');
var StanfordSimpleNLP = require('stanford-simple-nlp');
var googleImages = require('google-images');
var client = googleImages('017784427660853393287:n55qqfubfgk', 'AIzaSyA9dQPBOjXLUCkCQmZ0CfPzs6Uj6gAKd1M');
var is_nlp_allowed = false;
var Inert = require('inert');
var Path = require('path');
var Basic = require('hapi-auth-basic');
var LRU = require("lru-cache");
var options = {
    max: 5000,
    length: function(n, key) {
        return n * 2 + key.length
    },
    dispose: function(key, n) {
        n.close()
    }
};

cache = LRU(options);


if (process.argv.length != 3) {
    console.log("Error : Pass 1 arguments : Port To Use");
    process.exit();
} else {

    var stanfordSimpleNLP = new StanfordSimpleNLP.StanfordSimpleNLP(function(err) {
        if (!err)
		is_nlp_allowed = true;
    });

    var server = new Hapi.Server();
    server.connection({
        host: '0.0.0.0',
        port: process.argv[2],
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

    var validate = function(request, username, password, retFunc) {
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

    server.register(Inert, function() {});

    server.register(Basic, function(err) {
        server.auth.strategy('simple', 'basic', {
            validateFunc: validate
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
                            var tokens = [];
                            var inpSentences = result.document.sentences.sentence;
                            if (!(inpSentences instanceof Array)) {
                                tokens = inpSentences.tokens.token;
                            } else {
                                for (var i = 0; i < inpSentences.length; i++) {
                                    tokens = tokens.concat(inpSentences[i].tokens.token)
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
			    console.log("11111"+phrase);
                            if (phrase != "") {
                                var cacheData = cache.get(phrase);
                                if (cacheData != undefined) {
                                    reply({
                                        "status": 1,
                                        "data": {
                                            "image": cacheData,
                                            "phrase": phrase
                                        }
                                    });
                                    return;
                                } else {
                                    var data_to_return = '{"Error":101}';
                                    client.search(phrase).then(function(images) {
                                        if (images != null) {
                                            for (var cntr = 0; cntr < images.length; cntr++) {
                                                delete images[cntr]['type'];
                                                delete images[cntr]['size'];
                                                delete images[cntr]['thumbnail'];
                                            }
					    console.log(images);
                                            data_to_return = JSON.stringify(images);
                                        }
                                        cache.set(phrase, data_to_return);

                                        reply({
                                            "status": 1,
                                            "data": {
                                                "image": data_to_return,
                                                "phrase": phrase
                                            }
                                        });
                                    });
                                }
                            } else {
                                reply({
                                    "status": -1,
                                    "error": 128
                                });
                            }

                        });
                    } else {
                        reply({
                            "status": -1,
                            "error": 119
                        });
                    }
                }
            }
        });


        server.start(function() {
            console.log('Owlie running at: ' + server.info.uri);
        });
    });
}
