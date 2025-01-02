require('dotenv').config();
const { data, helpers } = require('./data.js');
const postImage = require('./postImage.js').postImage;
const path = require('node:path');
const fs = require('node:fs');

const mainTimeout = data.day * 2;//timeouts for collectors - 48 hours for initial ping, 12 hours for clarification
const clarificationTimeout = data.day / 2
var collectors; //global variable tracking current number of collectors
var allPostingChannels;//global variable tracking the posting channels

const startUp = async (client) => {//startup function called when bot activates

    console.log("Calling startUp");

    const dataPath = path.join(__dirname, 'data');
    const serverConfigFiles = fs.readdirSync(dataPath).filter(file => file.startsWith('server-config-'));

    collectors = 0;//start collector value at 0
    allPostingChannels = [];

    console.log("serverConfigFiles: ")
    console.log(serverConfigFiles)

    //set up posting channels
    for (let i = 0; i < serverConfigFiles.length; i++) {
        let serverConfigFile = serverConfigFiles[i];
        //console.log("serverConfigFile: ")
        //console.log(serverConfigFile)
        const filePath = path.join(dataPath, serverConfigFile);
        const serverConfig = require(filePath);

        //console.log(serverConfig);

        const galleryChannel = await client.channels.cache.get(serverConfig.galleryChannelId); //get gallery channel
        const nsfwChannel = await client.channels.cache.get(serverConfig.nsfwChannelId);
        allPostingChannels[serverConfig.guildId] = [galleryChannel, nsfwChannel];//get both (narrow to just gallery later based on user selection)
    }
}

const artCollector = async (artMessage, botResponse, reinitialize) => {

    if (reinitialize) {
        console.log("Restarting collector for ")
    }
    else {
        console.log("Starting collector for ")
    }

    console.log("Guild: " + artMessage.guild.id + " Channel: " + artMessage.channel.id + "Message: " + artMessage.id)

    // takes in the art post, the bot's response message,  
    // and whether this is a new collector or a reinitialization

    //tracking variables for reinitialization case
    var reinitialized = false;//reinitialization loop stopper
    var collectorNeeded = true; //whether to run the primary post collector - defaults true

    //set up emoji tracker variables
    var yesDetected = false;
    var spoilerDetected = false;
    var nsfwDetected = false;
    var doneDetected = false;

    if (reinitialize) {//check emoji on reinitialize - collector may not be needed
        var processed = 0; //counter for loop
        botResponse.reactions.cache.forEach(async (reaction) => {//iterate through existing reactions - listen for the original 4
            if ((reaction.emoji.name === helpers.yEmoji || reaction.emoji.name === helpers.spoilerEmoji || reaction.emoji.name === helpers.nsfwEmoji ||
                reaction.emoji.name === helpers.checkEmoji)) {
                const reactors = await reaction.users.fetch();//get the people who reacted
                reactors.forEach(async (id) => {//for each person who used each emoji
                    if (id == artMessage.author.id) {//only care about emoji from the artist
                        if (reaction.emoji.name === helpers.checkEmoji) doneDetected = true
                        else if (reaction.emoji.name === helpers.yEmoji) yesDetected = true
                        else if (reaction.emoji.name === helpers.spoilerEmoji) spoilerDetected = true
                        else if (reaction.emoji.name === helpers.nsfwEmoji) nsfwDetected = true
                    }
                })
            }
            processed++;//count processed emoji at end of each loop (tracks whether the forEach is done)
            if (processed === botResponse.reactions.cache.size) {
                if (doneDetected) {//done is the basic prereq - if done, check whether clarification is needed
                    //done without Yes, or Yes + Done without spoiler or unspoiler
                    var unspoiler = data.unspoilerCheck(artMessage.attachments);//check unspoiler status
                    if (!yesDetected || (yesDetected && !spoilerDetected && !unspoiler)) {
                        console.log("Skipping collector. Sufficient data detected on reinitialization.")
                        collectorNeeded = false;
                    } else if (yesDetected && (spoilerDetected || unspoiler)) {
                        console.log("Skipping primary collector. Initiating secondary collector.")
                        collectorNeeded = false;
                    }
                };
                reinitialized = true;
            }//otherwise run collector normally with existing values for existing emoji
        })
    }
    if (reinitialize) await data.waitFor(_ => reinitialized === true);//if reinitializing, wait for the reaction loop to complete 
    if (collectorNeeded) {//don't run the collector if it's not necessary

        const collectorFilter = (reaction, user) => {//filter for specific emoji and original poster
            return (reaction.emoji.name === helpers.yEmoji || reaction.emoji.name === helpers.spoilerEmoji || reaction.emoji.name === helpers.nsfwEmoji ||
                reaction.emoji.name === helpers.checkEmoji) && user.id === artMessage.author.id;
        };
        const collector = botResponse.createReactionCollector({ filter: collectorFilter, time: mainTimeout, dispose: true }); //watch the message for the right emoji
        collectors = await data.collectorsUp(collectors, botResponse.guildId, botResponse.channelId, botResponse.id, true);
        //increment active collectors and report (do add to file, even reinitialize has removed it and needs it back)

        //end on detecting ✅, record detecting the others
        collector.on('collect', async (reaction, user) => {
            if (!yesDetected && reaction.emoji.name === helpers.yEmoji) yesDetected = true; //use detector vars to know when they're clicked
            if (!spoilerDetected && reaction.emoji.name === helpers.spoilerEmoji) spoilerDetected = true;
            if (!nsfwDetected && reaction.emoji.name === helpers.nsfwEmoji) nsfwDetected = true;

            if (!doneDetected && reaction.emoji.name === helpers.checkEmoji) {
                doneDetected = true; //this one only reacts the first time and doesn't care if it's removed
                collector.stop();//turn off the collector after it receives this emoji
            }
        });

        collector.on('remove', (reaction) => {
            if (yesDetected && reaction.emoji.name === helpers.yEmoji) yesDetected = false; //toggle detector vars on remove
            if (spoilerDetected && reaction.emoji.name === helpers.spoilerEmoji) spoilerDetected = false;
            if (nsfwDetected && reaction.emoji.name === helpers.nsfwEmoji) nsfwDetected = false;
        });

        collector.on('end', async (collected, reason) => {//edit instruction message on collector stop
            var editTrackerFile = true; //defaults to true - normal behavior is to edit collector tracker on stop
            var unspoiler = false;//unspoiler defaults to false

            //check unspoiler status (break up status and collector creation to make file tracking possible)
            if (yesDetected && !spoilerDetected) {//if they did *not* spoiler (but they did say yes, it doesn't otherwise matter) check if any images are spoilered
                unspoiler = data.unspoilerCheck(artMessage.attachments);
            };

            //check if there's going to be another collector opening up
            if (spoilerDetected || unspoiler) { editTrackerFile = false }//in the two conditions where more clarification is needed, don't remove that post link from the tracking list

            collectors = await data.collectorsDown(collectors, botResponse.guildId, botResponse.channelId, botResponse.id, editTrackerFile);//decrement active collectors on end and report
            //file edit is conditional on spoiler conditions - don't remove the post link if another collector is about to start on the exact same post

            var replaceMessage;//determine the new message to edit the post to
            if (reason === 'time' && !yesDetected) { replaceMessage = data.timeout }//indicate timeout stop if no 🇾 response
            else if (reason === 'user' || (reason === 'time' && yesDetected)) {//when a user stops the collector, or it times out with yes, post the image and edit the message

                var spoilerTag; //needs to exist as blank even when not updated

                //run secondary collectors based on the logical flags, return info if any
                [unspoiler, spoilerTag] = await secondaryCollectors(unspoiler, spoilerDetected, botResponse, artMessage);

                //feed all collected data into finish and post function!
                finishAndPost(reason, artMessage, botResponse, yesDetected, spoilerDetected, nsfwDetected, unspoiler, spoilerTag);//make the post!
            }

        });
    } else if (reinitialize) {//if collector wasn't needed, finish here
        //spoilerTag and unspoiler aren't relevant if clarification isn't needed - default them just in case
        var unspoiler, spoilerTag;

        //check secondary collector conditions and run those if applicable
        if (spoilerDetected || unspoiler) [unspoiler, spoilerTag] = await secondaryCollectors(unspoiler, spoilerDetected, botResponse, artMessage);

        finishAndPost(data.manualEndReason, artMessage, botResponse, yesDetected, spoilerDetected, nsfwDetected, unspoiler, spoilerTag);//make the post!
    }
}

const secondaryCollectors = async (unspoiler, spoilerDetected, botResponse, artMessage) => {
    //takes in the logical conditions, the bot's response for reacts/edits, and the art post to pass to the collector
    var spoilerTag;//create variables in negative state

    if (unspoiler) {//if unspoiler logic is in effect (spoilered image but not asked to spoiler)
        //edits the prompt and reacts to its own message
        await botResponse.edit({ content: data.unspoilerMessage })
        botResponse.react(helpers.yesEmoji);
        botResponse.react(helpers.noEmoji);

        //run response collector, return unspoiler and collector tracking (false for initialization)
        unspoiler = await unspoilerCollector(artMessage, botResponse, false);
        //unspoiler is reused safely because it gets a new default in the collector function
    }
    else if (spoilerDetected) {//if they chose spoiler, ask them for a spoiler tag to use
        await botResponse.edit({ content: data.spoilerMessage })//edit its message to ask for spoiler text
        botResponse.react(helpers.nEmoji); //add reaction

        //run response collector, return unspoiler and collector tracking (false for initialization)
        spoilerTag = await spoilerCollector(artMessage, botResponse, false);
    }

    return [unspoiler, spoilerTag]
}

const finishAndPost = async (
    reason, artMessage, botResponse, yesDetected, spoilerDetected, nsfwDetected, unspoiler, spoilerTag) => {
    //takes in an end reason (either custom or from collector ending) and the data needed to post

    if (reason === 'user' || (reason === 'time' && yesDetected) || reason === data.manualEndReason) {
        //when a user stops the collector, or it times out with yes, or this function was triggered elsewhere, post the image and edit the message

        var confirmationMessage = data.noMessage; //default response is no 

        //if yes, make the posts!
        if (yesDetected) {
            //get all the posting channels (in format [gallery, nsfw]) (Can we do better than this at some point?)
            var postingChannels = allPostingChannels[artMessage.guild.id];
            if (nsfwDetected) {
                postingChannels = [allPostingChannels[artMessage.guild.id][1]];//still an array, but just the second element
            }
            else {
                postingChannels = [allPostingChannels[artMessage.guild.id][0]];//still an array, but just the first element
            }
            console.log("guildId: " + artMessage.guild.id)
            confirmationMessage = await postImage(artMessage, postingChannels, spoilerDetected, spoilerTag, unspoiler); //post to channels and return links to posts!
        }
        replaceMessage = confirmationMessage//prepare to edit in the message
    }
    else { replaceMessage = data.genericEndMessage }//any other collector end reason gets a default response

    botResponse.edit({ content: replaceMessage, embeds: [] });//edit in final message status

}

const unspoilerCollector = async (artMessage, botResponse, reinitialize) => {
    // takes in the art post's author, the bot's response message, collector tracker, 
    // and whether this is a new collector or a reinitialization

    var reinitialized = false;//stopper variable for reinitialization loop
    var finished = false;//stopper variable for secondary collector waiting
    var unspoiler = false; //default is *not* to unspoiler

    //tracking variables for reinitialization case
    var unspoilerYes = false;
    var unspoilerNo = false;
    var nsfwDetected = false;//default false
    var collectorNeeded = true; //whether to run the collector at all - defaults true

    if (reinitialize) {//check emoji on reinitialize - collector may not be needed
        var processed = 0; //counter for loop
        botResponse.reactions.cache.forEach(async (reaction) => {
            //iterate through existing reactions - listen for nsfw and the two specific to this case
            if (reaction.emoji.name === helpers.yesEmoji || reaction.emoji.name === helpers.noEmoji || reaction.emoji.name === helpers.nsfwEmoji) {
                const reactors = await reaction.users.fetch();//get the people who reacted
                reactors.forEach(async (id) => {//for each person who used each emoji
                    if (id == artMessage.author.id) {//only care about emoji from the artist
                        if (reaction.emoji.name === helpers.yesEmoji) unspoilerYes = true//save emoji values
                        else if (reaction.emoji.name === helpers.noEmoji) unspoilerNo = true
                        else if (reaction.emoji.name === helpers.nsfwEmoji) nsfwDetected = true
                    }
                })
            }
            //if there is only yes or only no after checking all emoji, unspoiler can end here and just post
            processed++;//count processed emoji at end of each loop(tracks whether the forEach is done)
            if (processed === botResponse.reactions.cache.size) {
                if (unspoilerYes != unspoilerNo) {//if they aren't the same, one is true and the other false
                    console.log("Skipping collector. Sufficient data detected on reinitialization.")
                    unspoiler = unspoilerYes;//unspoiler = unspoilerYes (false if no is true, as it should be)
                    collectorNeeded = false;
                };
                reinitialized = true;
            }
            //the other cases are none or both - either way run collector as normal but post at the end
        })
    }
    if (reinitialize) await data.waitFor(_ => reinitialized === true);//if reinitializing, wait for the reaction loop to complete 
    if (collectorNeeded) {//don't collect unless needed
        collectors = await data.collectorsUp(collectors, botResponse.guildId, botResponse.channelId, botResponse.id, reinitialize);//increment active collectors and report 
        //don't add to file unless this is a reinitialization

        const unspoilerFilter = (reaction, user) => { return ((reaction.emoji.name === helpers.yesEmoji || reaction.emoji.name === helpers.noEmoji) && user.id === artMessage.author.id) };//filter for emojis by original poster
        const unspoilerCollector = botResponse.createReactionCollector({ filter: unspoilerFilter, time: clarificationTimeout, dispose: true }); //bot watches for a reaction

        unspoilerCollector.on('collect', (reaction) => {//on any collection, detect which then stop and move on - only need one result
            if (reaction.emoji.name === helpers.yesEmoji) unspoiler = true;
            unspoilerCollector.stop();
            finished = true; //callback flag for bot to move on
        });

        // unspoilerCollector.on('remove', (reaction) => {//on removal, if both were already selected, detect which then stop and move on
        //     console.log("remove detected!")
        //     if(unspoilerYes && unspoilerNo){//if both
        //         if(reaction.emoji.name === helpers.yesEmoji) unspoiler = false;
        //         if(reaction.emoji.name === helpers.noEmoji) unspoiler = true;//opposite responses since these are removals
        //         unspoilerCollector.stop();
        //         finished = true; //callback flag for bot to move on
        //     }
        // }); //does not currently run, fix later

        unspoilerCollector.on('end', async () => {
            collectors = await data.collectorsDown(collectors, botResponse.guildId, botResponse.channelId, botResponse.id, true);
        });//decrement active collectors and report (edit file, no longer tracking post)                 

        await data.waitFor(_ => finished === true);//waits for finished to be true, which happens when collector has gotten an answer and close
    }
    if (reinitialize) {
        //if it's a reinitialization, run finish and post here
        var spoilerTag;//should be undefined
        //yes is true and spoiler is false due to having gotten this far, remaining variable is nsfw
        finishAndPost(data.manualEndReason, artMessage, botResponse, true, false, nsfwDetected, unspoiler, spoilerTag);
    }

    return unspoiler;//return unspoiler status
}

const spoilerCollector = async (artMessage, botResponse, reinitialize) => {
    //takes in the art post's author, the bot's response message, collector tracker, and whether this is a new collector or a reinitialization

    var finished = false;//stopper variable for secondary collector waiting
    var reinitialized = false;//stopper variable for reinitialization loop

    //tracking variables for reinitialization case
    var noSpoilerTag = false;
    var nsfwDetected = false;//default false
    var collectorNeeded = true; //whether to run the collector at all - defaults true

    if (reinitialize) {//check emoji on reinitialize - collector may not be needed
        var processed = 0; //counter for loop
        botResponse.reactions.cache.forEach(async (reaction) => {//iterate through existing reactions - listen for nsfw and the specific 🇳 reaction
            if (reaction.emoji.name === helpers.nEmoji || reaction.emoji.name === helpers.nsfwEmoji) {
                const reactors = await reaction.users.fetch();//get the people who reacted
                reactors.forEach(async (id) => {//for each person who used each emoji
                    if (id == artMessage.author.id) {//only care about emoji from the artist
                        if (reaction.emoji.name === helpers.nEmoji) noSpoilerTag = true
                        else if (reaction.emoji.name === helpers.nsfwEmoji) nsfwDetected = true
                    }
                })
            }
            //if there is only yes or only no after checking all emoji, unspoiler can end here and just post
            processed++;//count processed emoji at end of each loop(tracks whether the forEach is done)
            if (processed === botResponse.reactions.cache.size) {
                if (noSpoilerTag) {//if they already clicked no, don't run the collector
                    console.log("Skipping collector. Sufficient data detected on reinitialization.")
                    collectorNeeded = false;
                };
                reinitialized = true;
            }//otherwise run collector and wait for either 🇳 or Reply
        })
    }
    if (reinitialize) await data.waitFor(_ => reinitialized === true);//if reinitializing, wait for the reaction loop to complete 

    if (collectorNeeded) {//don't run the collector if it's not necessary
        const noFilter = (reaction, user) => { return (reaction.emoji.name === helpers.nEmoji && user.id === artMessage.author.id) };//filter for 🇳 emoji by original poster
        const replyFilter = (reply) => { return (artMessage.author.id === reply.author.id && reply.reference && reply.reference.messageId === botResponse.id) };//filter for a reply from the poster to the bot
        const replyCollector = botResponse.channel.createMessageCollector({ filter: replyFilter, time: clarificationTimeout, max: 1 })//message collector watches for just the first applicable reply
        const noCollector = botResponse.createReactionCollector({ filter: noFilter, time: clarificationTimeout }); //reaction collector watches for a 🇳
        collectors = await data.collectorsUp(collectors, botResponse.guildId, botResponse.channelId, botResponse.id, reinitialize);//increment active collectors and report 
        //don't add to file unless this is a reinitialization

        var spoilerTag;//create blank, collect if supplied

        noCollector.on('collect', () => {
            noCollector.stop();//stop and move on if the reaction filter collects anything (since it's already filtered down to the one emoji)
            replyCollector.stop();
        }) //stop reply collector, too

        replyCollector.on('collect', async (replyMessage) => {//collect reply message if one is detected
            spoilerTag = await replyMessage.content;
        })
        await replyCollector.on('end', async () => {
            noCollector.stop() //make sure both collectors stop  
            collectors = await data.collectorsDown(collectors, botResponse.guildId, botResponse.channelId, botResponse.id, true);//decrement active collectors and report (edit file, no longer tracking post)
            finished = true;//when it stops waiting for replies it is done
        })

        await data.waitFor(_ => finished === true);//waits for finished to be true, which happens when collectors have gotten their answers and closed
    }
    if (reinitialize) {
        //if it's a reinitialization, run finish and post here
        //yes and spoiler true, unspoiler false due to having gotten this far, remaining variable is nsfw
        finishAndPost(data.manualEndReason, artMessage, botResponse, true, true, nsfwDetected, false, spoilerTag);
    }

    return spoilerTag;//return spoiler tag for use in posting
}

module.exports = { artCollector, unspoilerCollector, spoilerCollector, startUp };