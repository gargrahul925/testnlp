var gcm = require('node-gcm');
var assert = require('assert');

module.exports = function() {
    this.registerUser = function(db, userID, userName, posterImage, platform, callback) {
        var test = db.collection('users').find({
            "fbID": userID
        });
        test.count(function(err, count) {
            if (count == 0) {

                db.collection('users').insertOne({
                    "fbID": userID,
                    "fbName": userName,
                    "fbImage": posterImage,
                    "token": "",
                    "platform": platform
                }, function(err, result) {
                    assert.equal(err, null);
                    callback("User Created " + userID, false);
                });
            } else {
                callback({
                    "status": -1,
                    "Error": 200,
                    "msg": "user Id is already registered"
                }, true)
            }
        });
    };

    this.registerToken = function(db, userID, token, platform, callback) {
        db.collection('users').updateOne({
                "fbID": userID
            }, {
                $set: {
                    "token": token,
					"platform":platform
                }
            },
            function(err, results) {
                if (results != null) {
                    callback(results, false);
                } else {
                    callback({
                        "status": -1,
                        "Error": 201,
                        "msg": "token not generated"
                    }, true);
                }
            });
    };

    this.getUserInfo = function(db, userID, callback) {
        //console.log((new Date()).getTime());
        var cursor = db.collection('users').find({
            "fbID": userID
        });

        cursor.nextObject(function(err, item) {
            if (item != null) {
                //console.log((new Date()).getTime());
                callback({
                    "name": item.fbName,
                    "image": item.fbImage
                }, false);
            } else {

                callback({
                    "status": -1,
                    "Error": 202,
                    "msg": "userId not found"
                }, true);
            }
        });
    };


    this.createPoll = function(db, poll_id, who_id, back_image, launch_time, question_data, options_data, timer_value, prev_poll, story_caption, isMultiSelect, callback) {
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
                    "multi_select": isMultiSelect
                }, function(err, result) {
                    assert.equal(err, null);
                    // console.log("Poll Created " + poll_id);
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
                                                            data.type = 3;
                                                            data.poll_id = poll_id;
                                                            data.user_id = who_id;
                                                            data.user_name = item.fbName;
                                                            data.prev_poll = prev_poll;

                                                            data.message = item.fbName + " has created another question for " + story_caption + ".";
                                                            notifyForPoll(db, previous, who_id, data, function(returnVal, index) {

                                                            });
                                                        });
                                                    });
                                            });
                                        }
                                        callback(doc, false);
                                    }
                                );
                            });
                        } else {

                            callback({
                                "status": -1,
                                "Error": 203,
                                "msg": "poll not inserted correctly in database"
                            }, true);
                        }
                    });
                });
            } else {

                callback({
                    "status": -1,
                    "Error": 204,
                    "msg": "incomplete user information"
                }, true);
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
                        data.user_name = item.fbName;
                        data.message = item.fbName + " has renamed story " + old_caption + " to " + new_caption;
                        notifyForPoll(db, poll_id, user_id, data, null);
                    });

                    callback({
                        "status": 1
                    }, false);
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
                        data.type = 6;
                        data.user_id = user_id;
                        data.poll_id = poll_id;
                        data.user_name = item.fbName;
                        data.message = item.fbName + " has closed the story " + caption;
                        notifyForPoll(db, poll_id, user_id, data, null);
                    });
                    callback({
                        "status": 1
                    }, false);
                });
        });
    };

    this.deletePoll = function(db, poll_id, user_id, callback) {
        db.collection('userpolls').deleteOne({
                "poll_id": poll_id,
                "who_id": user_id
            },
            function(err, results) {
                assert.equal(err, null);
                if (results != "") {
                    if (results["result"]["n"] == 1)
                        callback(results, false);
                    else
                        callback({
                            "status": -1,
                            "Error": 217
                        }, true);
                } else {
                    callback({
                        "status": -1,
                        "Error": 218
                    }, true);
                }

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
                    findNextPoll(db, doc["next_poll"], "next_poll", user_id, callback, poll_list, userList, localIndex, false);
                } else {
                    poll_list.push(poll_id);
                    poll_list = poll_list.filter(function(elem, pos) {
                        return poll_list.indexOf(elem) == pos;
                    });
                    userList = userList.filter(function(elem, pos) {
                        return userList.indexOf(elem) == pos;
                    });
                    callback(poll_list, userList, localIndex, false);
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
						userList = userList.concat(doc.participants);
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
                                if (item != null) 
                                    doc[item.fbID] = item.fbName;
								
                                if (count == userList.length) 
								{
                                    fetchCommentsResults(db, poll_id, function(returnVal) {
                                       doc.comments = returnVal;
                                        doc.server_time = (new Date()).getTime();
                                        callback(doc, false);
                                    });
                                }
                            });
                        }
                    });
                });
            } else {

                callback({
                    "status": -1,
                    "Error": 205,
                    "msg": "No poll found with passed poll_id"
                }, true);
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
                        callback({
                            "status": -1,
                            "Error": 206,
                            "msg": "referenced poll is inactive"
                        }, true);
                        return;
                    }
                    assert.equal(err, null);
                    var jsonData = new Object();
                    if (doc.answers.length != 0)
                        jsonData = (doc.answers);

                    jsonData[user_id] = answer_number.split(",");
                    if (answer_number == "")
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
                                        //returnData.options = doc.options_data;
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
                                            data.user_name = item.fbName;
                                            data.choosen_answer = doc.options_data['option' + answer_number];
                                            notifyForPoll(db, poll_id, user_id, data, null);
                                        });
                                        if (callback != null)
                                            callback(returnData, false);
                                    });
                                } else {

                                    callback({
                                        "status": -1,
                                        "Error": 207,
                                        "msg": "No answer found with passed poll_id"
                                    }, true);
                                }
                            });

                        });

                });
            } else {

                callback({
                    "status": -1,
                    "Error": 208,
                    "msg": "No poll found with passed poll_id"
                }, true);
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
                                callback(results, false);
                            });

                    });
                });
            } else {
                callback({
                    "status": -1,
                    "Error": 209,
                    "msg": "invalid poll id"
                }, true);
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
                        callback("", false);
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
                            console.log("----------------------------------------",doc.answers[keys[count]]);
                            if (count == keys.length)
                                callback(returnData, false);
                        });
                    }
                });
            } else {
                callback({
                    "status": -1,
                    "Error": 210,
                    "msg": "invalid Poll Id"
                }, true);
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
                                                        data.type = 1;
                                                        data.poll_id = poll_id;
                                                        data.user_id = user_id;
                                                        data.message = "comment";
                                                        data.user_name = item.fbName;
                                                        data.added_comment = comment;
                                                        data.message_info = JSON.stringify(returnData);
                                                        notifyForPoll(db, poll_id, user_id, data, null);
                                                    });
													returnData.server_time = (new Date()).getTime();
                                                    callback(returnData, false);
                                                }
                                            });
                                        }
                                    });
                                } else {
                                    callback({
                                        "status": -1,
                                        "Error": 211,
                                        "msg": "poll Id not found with required parameters"
                                    }, true);
                                }
                            });
                        });

                });
            } else {
                callback({
                    "status": -1,
                    "Error": 212,
                    "msg": "invalid poll Id"
                }, true);
            }
        });
    };


    this.retrievePollsByUserID = function(db, user_id, poll_id, launch_t, callback) {
        var cursor;
        var findObj = {
            participants: user_id,
            prev_poll: ""
        };
        if (launch_t != null && parseInt(launch_t) == launch_t) {
            findObj.launch_time = {
                $lt: launch_t
            }
        }
        cursor = db.collection('userpolls').find(findObj, {
            "who_id": 1,
            "question_data": 1,
            "back_image": 1,
            "launch_time": 1,
            "poll_id": 1,
            "story_caption": 1,
            "is_active": 1,
            "participants": 1
        }).sort({
            launch_time: -1
        }).limit(10);
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
                                        return b.launch_time - a.launch_time;
                                    });
                                    callback(returnData, false);
                                }
                            });
                        });
                    }
                });
            } else {
                callback({
                    "status": -1,
                    "Error": 213,
                    "msg": "No polls found with current user id"
                }, true);
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
                            callback({
                                "status": 1,
                                "data": JSON.stringify(data_to_return)
                            }, false);
                        }
                    });
                } else {
                    callback({
                        "status": -1,
                        "Error": 214,
                        "msg": "No Polls"
                    }, true)
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
                        callback({
                            "status": -1,
                            "msg": "Duplicate Option"
                        }, true)
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
                                data.type = 2;
                                data.poll_id = poll_id;
                                data.user_id = user_id;
                                data.user_name = user_name;
                                data.option = option_data;
                                data.message = user_name + " has suggested a new option."
                                notifyForPoll(db, poll_id, user_id, data, null);
                                callback({
                                    "status": 1,
                                    "data": JSON.stringify(item.options_data)
                                }, false);
                            }
                        );
                    }
                });
            } else {
                callback({
                    "status": -1,
                    "Error": 215,
                    "msg": "Incorrect Poll Id"
                }, true)
            }
        });
    }


    this.pokeForPoll = function(db, poll_id, user_id, story_caption, callback) {
        var user_cursor = db.collection('users').find({
            "fbID": user_id
        });
        user_cursor.nextObject(function(err, item) {
            var data = new Object();
            data.type = 4;
            data.user_id = user_id;
            data.poll_id = poll_id;
            data.user_name = item.fbName;
            data.message = item.fbName + " has requested your opinion on " + story_caption;
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


                    if (data.type < 3) {
                        db.collection('users').find({
                            'fbID': {
                                $in: item.participants
                            }
                        }, {
                            token: 1,
                            platform: 1
                        }).toArray(function(err, items) {
                            var returnData = new Object();
                            returnData["Status"] = "1";
                            var tokens = [];
                            var tokensSystem = [];
                            for (var cnt = 0; cnt < items.length; cnt++) {
                                if (items[cnt].token != undefined && items[cnt].token != "") {
                                    tokens.push(items[cnt].token);
                                    if (items[cnt].platform != undefined && items[cnt].platform == 1) {
                                        tokensSystem.push(items[cnt].token);
                                    }
                                }
                            }
							if(data.type == 2)
							{
                            	sendGcmMessageSystem(db, tokensSystem, data);
                            }
							sendGcmMessage(db, tokens, data);
                            if (callback != null)
                                callback(returnData, false);
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
                                            callback(returnData, false);
                                    });
                                }
                            });
                        }
                    }
                });
            } else {
                callback({
                    "status": -1,
                    "Error": 216
                }, true);
            }
        });
    }

    this.sendGcmMessage = function(db, tokens, data) {
        var message = new gcm.Message();
        var cursor = db.collection('userpolls').find({
            poll_id: data.poll_id,
        }, {
            back_image: 1,
            story_caption: 1,
            question_data: 1,
            who_id: 1
        });

        cursor.count(function(err, count) {
            if (count == 1) {
                cursor.nextObject(function(err, item) {
                    data.back_image = item.back_image;
                    data.story_caption = item.story_caption;
                    data.question_data = item.question_data;
                    data.who_id = item.who_id;

                    message.addData('data', data);

                    var sender = new gcm.Sender('AIzaSyAeMjVWq4mMTA40X-mPZPcLHoIf3HPMHH0');

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

    this.sendGcmMessageSystem = function(db, tokens, data) {
        var message = new gcm.Message({
            priority: 'high'
        });
        message.addData('data', data);

        var cursor = db.collection('userpolls').find({
            poll_id: data.poll_id,
        }, {
            story_caption: 1,
            question_data: 1,
        });

        cursor.count(function(err, count) {
            if (count == 1) {
                cursor.nextObject(function(err, item) {
                    if (data.type == 0) //answer
                    {
                        message.addNotification('body', data.user_name + " has responded to your question \"" + item.question_data.data + "\"");

                    } else if (data.type == 1) //Commented
                    {
                        message.addNotification('body', data.user_name + " has commented \"" + data.added_comment + "\" to your question \"" + item.question_data.data + "\"");
                    } else 
					if (data.type == 2) //has added an option
                    {
                        message.addNotification('body', data.user_name + " has added an option \"" + data.option + "\" to the question \"" + item.question_data.data + "\"");
	                    message.addNotification('title', item.story_caption);
	                    message.addNotification('icon', 'ic_launcher');
	
                    }

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
            callback({
                "Status": 1
            }, false);
        });
    }
}
