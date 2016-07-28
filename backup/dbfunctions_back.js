var gcm = require('node-gcm');
var assert = require('assert');

module.exports = function() {
    this.registerUser = function(db, userID, userName, posterImage, callback) {
        var test = db.collection('users').find({
            "fbID": userID
        });
        test.count(function(err, count) {
            if (count == 0) {

                db.collection('users').insertOne({
                    "fbID": userID,
                    "fbName": userName,
                    "fbImage": posterImage,
                    "token": ""
                }, function(err, result) {
                    assert.equal(err, null);
                    console.log("User Created " + userID);
                    callback('{"Error":0}');
                });
            } else {
                callback('{"Error":100}');
            }
        });
    };

    this.registerToken = function(db, userID, token, callback) {
        db.collection('users').updateOne({
                "fbID": userID
            }, {
                $set: {
                    "token": token
                }
            },
            function(err, results) {
                assert.equal(err, null);
                callback(results);
            });
    };

    this.getUserInfo = function(db, userID, callback) {
        var cursor = db.collection('users').find({
            "fbID": userID
        });

        cursor.nextObject(function(err, item) {
            if (item != null) {
                callback('{"name":"' + item.fbName + '","image":"' + item.fbImage + '"}');
            } else {
                callback('{"Error":101}');
            }
        });
    };


    this.createPoll = function(db, poll_id, who_id, back_image, launch_time, question_data, options_data, timer_value, prev_poll, story_caption,isMultiSelect, callback) {
		
		
		
        var userCursor = db.collection('users').find({
            "fbID": who_id
        });

        var previous = prev_poll;
        userCursor.nextObject(function(err, item) {
            if (item != null) {
                var participantInfo = [];
                participantInfo.push("" + who_id);
                db.collection('userpolls').insertOne({
                    "poll_id": poll_id,
                    "who_id": who_id,
                    "back_image": back_image,
                    "launch_time": launch_time,
                    "answers": "",
                    "question_data": question_data,
                    "options_data": options_data,
                    "timer_value": timer_value,
                    "next_poll": "",
                    "prev_poll": prev_poll,
                    "comments": "",
                    "participants": participantInfo,
                    "is_active": 1,
                    "story_caption": story_caption,
					"multi_select":isMultiSelect
                }, function(err, result) {
                    assert.equal(err, null);
                    console.log("Poll Created " + poll_id);
                    var cursor = db.collection('userpolls').find({
                        "poll_id": poll_id
                    });
                    cursor.count(function(err, count) {
                        if (count == 1) {
                            cursor.nextObject(function(err, doc) {
                                assert.equal(err, null);
                                doc.user_name = item.fbName;
                                db.collection('userpolls').updateOne({
                                        "poll_id": prev_poll
                                    }, {
                                        $set: {
                                            "next_poll": poll_id
                                        }
                                    },
                                    function(err, results) {

                                        if (previous != "") {

                                            var participantsCursor = db.collection('userpolls').find({
                                                "poll_id": prev_poll
                                            }, {
                                                participants: 1
                                            });

                                            participantsCursor.nextObject(function(err, item) {

                                                db.collection('userpolls').updateOne({
                                                        "poll_id": poll_id
                                                    }, {
                                                        $set: {
                                                            "participants": item.participants
                                                        }
                                                    },
                                                    function(err, results) {
                                                        assert.equal(err, null);
                                                        var user_cursor = db.collection('users').find({
                                                            "fbID": who_id
                                                        });
                                                        user_cursor.nextObject(function(err, item) {
                                                            var data = new Object();
                                                            data.type = 1;
                                                            data.poll_id = poll_id;
                                                            data.user_id = who_id;
															data.prev_poll = prev_poll;

                                                            data.message = item.fbName + " has created another question for "+story_caption+".";
                                                            notifyForPoll(db, previous, who_id, data, function(returnVal, index) {

                                                            });
                                                        });
                                                    });
                                            });
                                        }
                                        callback(doc);
                                    }
                                );
                            });
                        } else {
                            callback('{"Error":102}');
                        }
                    });
                });
            } else {
                callback('{"Error":101}');
            }
        });

    };

    this.changeStoryCaption = function(db, poll_id, user_id, old_caption, new_caption, callback) {
        retrieveNestedPollChain(db, poll_id, -1, -1, function(poll_list, answered_polls, retIndex) {
            db.collection('userpolls').updateMany({
                    "poll_id": {
                        $in: poll_list
                    }
                }, {
                    $set: {
                        "story_caption": new_caption
                    }
                },
                function(err, results) {
                    assert.equal(err, null);

                    var user_cursor = db.collection('users').find({
                        "fbID": user_id
                    });
                    user_cursor.nextObject(function(err, item) {
                        var data = new Object();
                        data.type = 5;
                        data.user_id = user_id;
                        data.poll_id = poll_id;
                        data.message = item.fbName + " has renamed story " + old_caption + " to " + new_caption;
                        notifyForPoll(db, poll_id, user_id, data, null);
                    });

                    callback('{"status":1}');
                });
        });
    }

    this.closePoll = function(db, poll_id, user_id, caption, callback) {

        retrieveNestedPollChain(db, poll_id, -1, -1, function(poll_list, answered_polls, retIndex) {
            db.collection('userpolls').updateMany({
                    "poll_id": {
                        $in: poll_list
                    }
                }, {
                    $set: {
                        "is_active": 0
                    }
                },
                function(err, results) {
                    assert.equal(err, null);
                    var user_cursor = db.collection('users').find({
                        "fbID": user_id
                    });
                    user_cursor.nextObject(function(err, item) {
                        var data = new Object();
                        data.type = 5;
                        data.user_id = user_id;
                        data.poll_id = poll_id;
                        data.message = item.fbName + " has closed the story " + caption;
                        notifyForPoll(db, poll_id, user_id, data, null);
                    });
                    callback('{"status":1}');
                });
        });
    };

    this.deletePoll = function(db, poll_id, callback) {
        db.collection('userpolls').deleteOne({
                "poll_id": poll_id
            },
            function(err, results) {
                assert.equal(err, null);
                callback(results);
            });
    };

    this.findNextPoll = function(db, poll_id, direction, user_id, callback, poll_list, userList, localIndex) {
        var cursor = db.collection('userpolls').find({
            "poll_id": poll_id
        }, {
            answers: 1,
            next_poll: 1,
            prev_poll: 1
        });

        cursor.nextObject(function(err, doc) {
            assert.equal(err, null);
            if (doc.answers[user_id] != undefined)
                userList.push(poll_id);
            if (doc[direction] == "") {
                if (direction == "prev_poll" && doc["next_poll"] != "") {
                    poll_list.push(poll_id);
                    poll_list.push(doc["next_poll"]);
                    findNextPoll(db, doc["next_poll"], "next_poll", user_id, callback, poll_list, userList, localIndex);
                } else {
                    poll_list.push(poll_id);
                    poll_list = poll_list.filter(function(elem, pos) {
                        return poll_list.indexOf(elem) == pos;
                    });
                    userList = userList.filter(function(elem, pos) {
                        return userList.indexOf(elem) == pos;
                    });
                    callback(poll_list, userList, localIndex);
                }
            } else {
                if (direction == "next_poll")
                    poll_list.push(poll_id);
                findNextPoll(db, doc[direction], direction, user_id, callback, poll_list, userList, localIndex);
            }
        });
    }

    this.retrieveNestedPollChain = function(db, poll_id, user_id, index, callback) {
        var poll_list = [];
        var userList = [];
        var localIndex = index;
        findNextPoll(db, poll_id, "prev_poll", user_id, callback, poll_list, userList, localIndex);
    }

    this.retrievePoll = function(db, poll_id, user_id, callback) {
        var cursor = db.collection('userpolls').find({
            "poll_id": poll_id
        });

        cursor.count(function(err, count) {
            if (count == 1) {
                cursor.nextObject(function(err, doc) {
                    assert.equal(err, null);

                    retrieveNestedPollChain(db, poll_id, user_id, -1, function(returnVal, answered_polls, retIndex) {
                        doc.polls_list = returnVal;
                        doc.answered_polls = answered_polls;

                        var userList = [];
                        userList.push(doc.who_id);
                        userList = userList.concat(Object.keys(doc.answers));
                        userList = userList.concat(Object.keys(doc.comments));
                        userList = userList.filter(function(elem, pos) {
                            return userList.indexOf(elem) == pos;
                        })
                        var count = 0;
                        for (var k = 0; k < userList.length; k++) {
                            var userCursor = db.collection('users').find({
                                "fbID": userList[k]
                            });
                            userCursor.nextObject(function(err, item) {
                                count++;
                                if (item != null) {
                                    doc[userList[count - 1]] = item.fbName;
                                    if (count == userList.length) {

                                        fetchCommentsResults(db, poll_id, function(returnVal) {
                                            doc.comments = returnVal;
                                            doc.server_time = (new Date()).getTime();
                                            callback(doc);
                                        });
                                    }
                                }
                            });
                        }
                    });
                });
            } else {
                callback('{"Error":102}');
            }
        });
    };

    this.answerPoll = function(db, poll_id, user_id, answer_number, callback) {
        var cursor = db.collection('userpolls').find({
            "poll_id": poll_id
        });
        cursor.count(function(err, count) {
            if (count == 1) {
                cursor.nextObject(function(err, doc) {
                    if (doc.is_active == 0) {
                        callback('{"status":-1,"Error":106}');
                        return;
                    }
                    assert.equal(err, null);
                    var jsonData = new Object();
                    if (doc.answers.length != 0)
                        jsonData = (doc.answers);

                    jsonData[user_id] = answer_number.split(",");
		    		if(answer_number == "")
						delete jsonData[user_id];

                    db.collection('userpolls').updateOne({
                            "poll_id": poll_id
                        }, {
                            $set: {
                                "answers": jsonData
                            }
                        },
                        function(err, results) {
                            assert.equal(err, null);

                            var answercursor = db.collection('userpolls').find({
                                "poll_id": poll_id
                            }, {
                                "answers": 1,
                                "options_data": 1
                            });
                            answercursor.count(function(err, count) {
                                if (count == 1) {
                                    answercursor.nextObject(function(err, doc) {
                                        var keys = Object.keys(doc.answers);
                                        var returnData = new Object();
                                        returnData.count = keys.length;

                                        var count = parseInt(doc.options_data.count);
                                        returnData.answers = doc.answers;
                                        for (var test = 0; test < count; test++) {
                                            returnData[test + 1] = 0;
                                        }

                                        for (var test = 0; test < keys.length; test++) {

                                            for (var test2 = 0; test2 < doc.answers[keys[test]].length; test2++) {
                                                returnData[doc.answers[keys[test]][test2]] = returnData[doc.answers[keys[test]][test2]] + 1;
                                            }

                                        }
                                        var user_cursor = db.collection('users').find({
                                            "fbID": user_id
                                        });
                                        user_cursor.nextObject(function(err, item) {
                                            var data = new Object();
                                            data.type = 0;
                                            data.poll_id = poll_id;
                                            data.message_info = JSON.stringify(returnData);
                                            data.message = "answer";
                                            data.user_id = user_id;
                                            notifyForPoll(db, poll_id, user_id, data, null);
                                        });
                                        if (callback != null)
                                            callback(returnData);
                                    });
                                } else {
                                    callback('{"Error":105}');
                                }
                            });

                        });

                });
            } else {
                callback('{"Error":101}');
            }
        });
    };

    this.addParticipant = function(db, poll_id, participant_ids, callback) {
        var cursor = db.collection('userpolls').find({
            "poll_id": poll_id
        });
        cursor.count(function(err, count) {
            if (count == 1) {
                cursor.nextObject(function(err, doc) {
                    assert.equal(err, null);
                    var jsonData = [];
                    if (doc.participants.length != 0)
                        jsonData = doc.participants;

                    var participants = participant_ids.split("#");

                    for (var cntr = 0; cntr < participants.length; cntr++) {
                        jsonData.push(participants[cntr]);
                    }

                    jsonData = jsonData.filter(function(elem, pos) {
                        return jsonData.indexOf(elem) == pos;
                    });

                    retrieveNestedPollChain(db, poll_id, participants[0], -1, function(poll_list, answered_polls, retIndex) {
                        db.collection('userpolls').updateMany({
                                "poll_id": {
                                    $in: poll_list
                                }
                            }, {
                                $set: {
                                    "participants": jsonData
                                }
                            },
                            function(err, results) {
                                assert.equal(err, null);
                                callback(results);
                            });

                    });
                });
            } else {
                callback('{"Error":101}');
            }
        });
    };

    this.fetchCommentsResults = function(db, poll_id, callback) {

        var answercursor = db.collection('userpolls').find({
            "poll_id": poll_id
        }, {
            "comments": 1,
            "answers": 1
        });
        answercursor.count(function(err, count) {
            if (count == 1) {
                answercursor.nextObject(function(err, doc) {
                    var keys = Object.keys(doc.comments);
                    var returnData = [];
                    var count = 0;
                    if (keys.length == 0)
                        callback("");
                    for (var cntr = 0; cntr < keys.length; cntr++) {
                        var user_cursor = db.collection('users').find({
                            "fbID": keys[cntr]
                        });
                        user_cursor.nextObject(function(err, item) {
                            var newObject = new Object();
                            newObject.user_id = keys[count];
                            newObject.comment = doc.comments[keys[count]]["comment"];
                            newObject.when = doc.comments[keys[count]]["time"];
                            newObject.what = doc.answers[keys[count]];
                            newObject.fbName = item.fbName;
                            newObject.fbImage = item.fbImage;
                            returnData.push(newObject);
                            count++;
                            if (count == keys.length)
                                callback(returnData);
                        });
                    }
                });
            } else {
                callback('{"Error":105}');
            }
        });
    };


    this.addComment = function(db, poll_id, user_id, comment, callback) {
        var cursor = db.collection('userpolls').find({
            "poll_id": poll_id
        });
        cursor.count(function(err, count) {
            if (count == 1) {
                cursor.nextObject(function(err, doc) {
                    assert.equal(err, null);

                    var jsonData = new Object();
                    if (doc.comments.length != 0)
                        jsonData = doc.comments;

                    var dataObject = new Object();
                    dataObject["comment"] = comment;
                    dataObject["time"] = (new Date()).getTime();
                    jsonData[user_id] = dataObject;

                    db.collection('userpolls').updateOne({
                            "poll_id": poll_id
                        }, {
                            $set: {
                                "comments": jsonData
                            }
                        },
                        function(err, results) {
                            assert.equal(err, null);
                            var answercursor = db.collection('userpolls').find({
                                "poll_id": poll_id
                            }, {
                                "comments": 1,
                                "answers": 1
                            });
                            answercursor.count(function(err, count) {
                                if (count == 1) {
                                    answercursor.nextObject(function(err, doc) {
                                        var keys = Object.keys(doc.comments);
                                        var returnData = [];
                                        var count = 0;
                                        for (var cntr = 0; cntr < keys.length; cntr++) {
                                            var user_cursor = db.collection('users').find({
                                                "fbID": keys[cntr]
                                            });
                                            user_cursor.nextObject(function(err, item) {
                                                var newObject = new Object();
                                                newObject.user_id = keys[count];
                                                newObject.comment = doc.comments[keys[count]]["comment"];
                                                newObject.when = doc.comments[keys[count]]["time"];
                                                newObject.what = doc.answers[keys[count]];
                                                newObject.fbName = item.fbName;
                                                newObject.fbImage = item.fbImage;
                                                returnData.push(newObject);
                                                count++;
                                                if (count == keys.length) {
                                                    var user_cursor = db.collection('users').find({
                                                        "fbID": user_id
                                                    });
                                                    user_cursor.nextObject(function(err, item) {
                                                        var data = new Object();
                                                        data.type = 0;
                                                        data.poll_id = poll_id;
                                                        data.user_id = user_id;
                                                        data.message = "comment";
			                                            data.message_info = JSON.stringify(returnData);													
                                                        notifyForPoll(db, poll_id, user_id, data, null);
                                                    });
                                                    callback(returnData);
                                                }
                                            });
                                        }
                                    });
                                } else {
                                    callback('{"Error":105}');
                                }
                            });
                        });

                });
            } else {
                callback('{"Error":101}');
            }
        });
    };

    this.retrievePollsByUserID = function(db, user_id, callback) {
        var cursor = db.collection('userpolls').find({
            participants: user_id,
            prev_poll: ""
        }, {
            "who_id": 1,
            "question_data": 1,
            "back_image": 1,
            "launch_time": 1,
            "poll_id": 1,
            "story_caption": 1,
            "is_active": 1,
            "participants": 1
        });
        cursor.count(function(err, count) {
            if (count != 0) {
                var returnData = [];
                var i = 0;
                var masterCntr = 0;
                cursor.each(function(err, result) {

                    if (result != null) {
                        var user_cursor = db.collection('users').find({
                            "fbID": result.who_id
                        });

                        user_cursor.nextObject(function(err, item) {
                            i++;
                            if (item != null) {
                                result.user_name = item.fbName;
                                result.server_time = (new Date()).getTime();

                            } else {
                                result.user_name = "Unknown";
                            }

                            var dataToStore = result;
                            retrieveNestedPollChain(db, result.poll_id, user_id, -1, function(returnVal, answered_polls, retIndex) {
                                masterCntr++;
                                dataToStore.polls_list = returnVal;
                                dataToStore.answered_polls = answered_polls;
                                returnData.push(dataToStore);
                                if (masterCntr == count) {
                                    returnData = returnData.sort(function(a, b) {
                                        return a.launch_time - b.launch_time;
                                    });
                                    callback(returnData);
                                }
                            });
                        });
                    }
                });
            } else {
                callback('{"Error":101}');
            }
        });
    };


    this.summarizePoll = function(db, poll_id, user_id, callback) {
        retrieveNestedPollChain(db, poll_id, user_id, -1, function(poll_list, answered_polls, retIndex) {
            var cursor = db.collection('userpolls').find({
                poll_id: {
                    $in: poll_list
                }
            });
            cursor.count(function(err, count) {
                if (count >= 1) {
                    var i = 0;
                    var data_to_return = new Object();
                    cursor.each(function(err, result) {
                        data_to_return[i] = result;
                        i++;
                        if (i == count) {
                            callback('{"status":1,"data":' + JSON.stringify(data_to_return) + '}');
                        }
                    });
                } else {
                    callback('{"status":-1,"msg":"No Polls"}')
                }
            });
        });
    }

    this.addOption = function(db, poll_id, user_id, user_name, option_data, callback) {
        var cursor = db.collection('userpolls').find({
            "poll_id": poll_id
        }, {
            "options_data": 1
        });
        cursor.count(function(err, count) {
            if (count == 1) {
                cursor.nextObject(function(err, item) {
                    assert.equal(err, null);
                    var allowed = true;
                    var count = parseInt(item.options_data.count);
                    for (var i = 1; i <= parseInt(item.options_data.count); i++) {
                        if (item.options_data['option' + i].toUpperCase() == option_data.toUpperCase())
                            allowed = false;
                    }
                    if (!allowed) {
                        callback('{"status":-1,"msg":"Duplicate Option"}')
                    } else {
                        item.options_data['option' + (count + 1)] = option_data;
                        item.options_data.count = count + 1;

                        db.collection('userpolls').updateOne({
                                "poll_id": poll_id
                            }, {
                                $set: {
                                    "options_data": item.options_data
                                }
                            },
                            function(err, results) {
                                assert.equal(err, null);
                                var data = new Object();
                                data.type = 5;
                                data.poll_id = poll_id;
                                data.user_id = user_id;
                                data.message = user_name + " has suggested a new option."
                                notifyForPoll(db, poll_id, user_id, data, null);
                                callback('{"status":1,"data":' + JSON.stringify(item.options_data) + '}');
                            }
                        );
                    }
                });
            } else {
                callback('{"status":-1,"msg":"Incorrect Poll Id"}')
            }
        });
    }


    this.pokeForPoll = function(db, poll_id, user_id,story_caption, callback) {
        var user_cursor = db.collection('users').find({
            "fbID": user_id
        });
        user_cursor.nextObject(function(err, item) {
            var data = new Object();
            data.type = 2;
            data.user_id = user_id;
            data.poll_id = poll_id;
            data.message = item.fbName + " has requested your opinion on "+story_caption;
            notifyForPoll(db, poll_id, user_id, data, callback);
        });
    }

    this.notifyForPoll = function(db, poll_id, user_id, data, callback) {
        var cursor = db.collection('userpolls').find({
            poll_id: poll_id,
        }, {
            participants: 1
        });
        cursor.count(function(err, count) {
            if (count == 1) {
                cursor.nextObject(function(err, item) {
                    var count = 0;
                    var poke_candidates = [];
                    var participant;
                    var index = item.participants.indexOf(user_id);

                    if (index > -1) {
                        item.participants.splice(index, 1);
                    }


                    if (data.type == 0 || data.type == 5) {
                        db.collection('users').find({
                            'fbID': {
                                $in: item.participants
                            }
                        }, {
                            token: 1
                        }).toArray(function(err, items) {
                            var returnData = new Object();
                            returnData["Status"] = "1";
                            var tokens = [];
                            for (var cnt = 0; cnt < items.length; cnt++) {
                                if (items[cnt].token != undefined && items[cnt].token != "")
                                    tokens.push(items[cnt].token);
                            }

                            sendGcmMessage(db, tokens, data);
                            if (callback != null)
                                callback(returnData);
                        });
                    } else {
                        for (var cntr = 0; cntr < item.participants.length; cntr++) {
                            participant = item.participants[cntr];

                            retrieveNestedPollChain(db, poll_id, item.participants[cntr], cntr, function(poll_list, answered_polls, retIndex) {
                                count++;
                                if (poll_list.length != answered_polls.length)
                                    poke_candidates.push(item.participants[retIndex]);

                                if (count == item.participants.length) {
                                    db.collection('users').find({
                                        'fbID': {
                                            $in: poke_candidates
                                        }
                                    }, {
                                        token: 1
                                    }).toArray(function(err, items) {
                                        var returnData = new Object();
                                        returnData["Status"] = "1";
                                        var tokens = [];
                                        for (var cnt = 0; cnt < items.length; cnt++) {
                                            if (items[cnt].token != undefined && items[cnt].token != "")
                                                tokens.push(items[cnt].token);
                                        }

                                        sendGcmMessage(db, tokens, data);
                                        if (callback != null)
                                            callback(returnData);
                                    });
                                }
                            });
                        }
                    }
                });
            } else {
                callback('{"Error":101}');
            }
        });
    }

    this.sendGcmMessage = function(db, tokens, data) {
        var message = new gcm.Message();
        var cursor = db.collection('userpolls').find({
            poll_id: data.poll_id,
        }, {
            back_image: 1
        });

        cursor.count(function(err, count) {
            if (count == 1) {
                cursor.nextObject(function(err, item) {
                    data.back_image = item.back_image;
                    message.addData('data', data);

                    var sender = new gcm.Sender('AIzaSyAeq85VUUuGrgI6hlOhQY57WBP5picUI18');

                    sender.send(message, {
                        registrationTokens: tokens
                    }, function(err, response) {
                        if (err)
                            console.error(err);
                        else
                            console.log(response);
                    });
                });
            }
        });

    }

    this.clearDatabase = function(db, callback) {
        db.collection('userpolls').deleteMany({}, function(err, results) {
            callback('{"Status":1}');
        });
		/*
		var participantsInfo = [ "127285120996319", "129474307443834", "114687558924357", "118709651854928", "145737192482499" ];
		
        db.collection('userpolls').insertOne({
            "poll_id": "V1jk4Dzhe",
            "who_id": "127285120996319",
            "back_image" : "http://img1.10bestmedia.com/Images/Photos/289906/bull-street-3_54_990x660.jpg",
            "launch_time" : 1457091786700,
            "answers": "",
            "question_data" : { "data" : "When do you want to go for lunch?", "type" : "0" },
            "options_data" : { "option1" : "1.20 PM", "count" : 2, "type" : "0", "option2" : "2.30 PM" },
            "timer_value": "",
            "next_poll": "",
            "prev_poll": "",
            "comments": "",
            "participants": participantsInfo,
            "is_active": 1,
            "story_caption": "Lunch?",
			"multi_select":0
        }, function(err, result) {
		});
		
        db.collection('userpolls').insertOne({
            "poll_id": "VygH6Pz2l",
            "who_id": "129474307443834",
            "back_image" : "http://www.karmasurfretreat.com/wp-content/uploads/2012/01/Yoga-Asanas-Strand.jpg",
            "launch_time" : 1457092300737,
            "answers": "",
            "question_data" : { "data" : "In-house yoga classes anyone?", "url_title" : "How Your Yoga Experience Can Make You a Better Entrepreneur", "type" : "1", "url_desciption" : "For some, yoga is an antidote to startup stress. For others, it's the passion that makes you become an entrepreneur in the first place.", "mainImage" : "http://images.inc.com/uploaded_files/image/970x450/getty_184428711_970647970450028_56527.jpg", "url" : "http://www.inc.com/john-boitnott/how-to-use-your-yoga-experience-to-become-an-entrepreneur.html" },
            "options_data" : { "option1" : "Yes! Its Great!", "option2" : "I am not sure", "option3" : "No! I don't think we need it.", "count" : 3, "type" : "0" },
			"timer_value": "",
            "next_poll": "",
            "prev_poll": "",
            "comments": "",
            "participants": participantsInfo,
            "is_active": 1,
            "story_caption": "In-house Yoga Classes",
			"multi_select":0
        }, function(err, result) {
		});
		
        db.collection('userpolls').insertOne({
            "poll_id": "Vka1LPG2e",
            "who_id": "127285120996319",
            "back_image" : "https://i.ytimg.com/vi/eX_iASz1Si8/maxresdefault.jpg",
            "launch_time" : 1457094175551,
            "answers": "",
            "question_data" : { "data" : "Do you think Ben Affleck is any good in this as Batman?  ", "type" : "1", "url" : "https://youtu.be/eX_iASz1Si8" },
            "options_data" : { "option1" : "He seems good.", "option2" : "What? he'll be great", "option3" : "Meh.", "count" : 3, "type" : "0" },
            "timer_value": "",
            "next_poll": "",
            "prev_poll": "",
            "comments": "",
            "participants": participantsInfo,
            "is_active": 1,
            "story_caption": "Batman v Superman",
			"multi_select":0
        }, function(err, result) {
		});
		*/
       
	db.collection('users').deleteMany({}, function(err, results) {
        });
    }
}

