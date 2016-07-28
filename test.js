var StanfordSimpleNLP = require('stanford-simple-nlp');
var csNodeCache = require('cache-service-node-cache');
var nodeCache = new csNodeCache();
var googleImages = require('google-images');
var client = googleImages('006237153096981378593:3prpuc6kgts', 'AIzaSyA8EqoLls3295vB6YptRoE2LlcuE4bOgp8');
var prompt = require('prompt');
prompt.start();


var stanfordSimpleNLP = new StanfordSimpleNLP.StanfordSimpleNLP(function(err) {
	console.log(err);
	promptUser();
});

function promptUser() 
{
	    prompt.get(['text'], function (err, result) 
		{
		    if (err) { return onErr(err); }
			
    		stanfordSimpleNLP.process(result.text, function(err, result) {
    		    var tokens = result.document.sentences.sentence.tokens.token;
    		    var phrase = "";
    		    for (var k = 0; k < tokens.length; k++) {
    		        console.log(tokens[k].POS);
    		        console.log(tokens[k].word);
					
					if(tokens[k].POS.lastIndexOf('NN', 0) === 0 /*|| tokens[k].POS.lastIndexOf('VB', 0) === 0 */)
					{
    		            phrase += tokens[k].word + " ";
    		        }
    		    }
				phrase = phrase.trim();
    		    console.log("1"+phrase.trim());
    		    if (phrase != "") {
    		        client.search(phrase).then(function(images) {
    		
    		            if (images != null) {
    		                for (var i = 0; i < images.length; i++) {
    		                    console.log(images[i].url);
    		                }
    		            }
    					promptUser();
    		        });
    		    }
				else
				{
					promptUser();
				}
    		});
		});
	}

function onErr(err) 
{
    console.log(err);
    return 1;
}

