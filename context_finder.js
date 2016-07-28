var Hapi=  require('hapi');
var StanfordSimpleNLP = require('stanford-simple-nlp');
var googleImages = require('google-images');
var Client = require('node-rest-client').Client;
var client = new Client();
var is_nlp_allowed = false;
var Inert = require('inert');
var Path = require('path');
var Basic = require('hapi-auth-basic');
var LRU = require("lru-cache");
var options = {
  max: 5000,
  length: function (n, key) {
    return n * 2 + key.length
  },
  dispose: function (key, n) {
    n.close()
  }
};

cache = LRU(options);


if (process.argv.length != 3) {
  console.log("Error : Pass 1 arguments : Port To Use");
  process.exit();
} else {

  var stanfordSimpleNLP = new StanfordSimpleNLP.StanfordSimpleNLP(function (err) {
    if (!err) {
      is_nlp_allowed = true;
    }
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
      password: 'anandsentme'
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

  server.register(Inert, function () {
  });

  server.register(Basic, function (err) {
    server.auth.strategy('simple', 'basic', {
      validateFunc: validate
    });

    server.route({
      method: 'GET',
      path: '/owlie/fetchContextualImage',
      config: {
        auth: 'simple',
        handler: function (request, reply) {
          var text = request.query.text ? request.query.text : "";
          if (!text != "" || !is_nlp_allowed) {
            return reply({
              "status": -1,
              "error": 119
            });
          }
          stanfordSimpleNLP.process(text, function (err, result) {
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
            }
            else {
              for (var k = 0; k < tokens.length; k++) {
                if (tokens[k].POS.lastIndexOf('NN', 0) === 0) {
                  phrase += tokens[k].word + " ";
                }
              }
            }
            phrase = phrase.trim();
            if (!phrase) {
              return reply({
                "status": -1,
                "error": 128
              });
            }
            var cacheData = cache.get(phrase);
            if (cacheData) {
              return reply({
                "status": 1,
                "data": {
                  "image": cacheData,
                  "phrase": phrase
                }
              });
            }
            var data_to_return = '{"Error":101}';
            var requestURL = "https://api.unsplash.com/photos/search?page=1&query=" + phrase +
              "&client_id=9d89989ea3fbc2dca19a55ae24dd667e3a2a6bc4e37180642fdd47fe3fc06c42&per_page=1";
            client.get(requestURL, function (data, response) {
              console.log("------------------------------",data,response)

            }).on('error', function (err) {
              reply({
                "status": 1,
                "data": {
                  "image": data_to_return,
                  "phrase": phrase
                }
              });
            });
          });
        }
      }
    });


    server.start(function () {
      console.log('Owlie running at: ' + server.info.uri);
    });
  });
}
