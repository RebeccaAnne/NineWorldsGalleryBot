require('dotenv').config();
const {data, helpers} = require('./data.js');
const postImage = require('./postImage.js').postImage;

const mainTimeout = data.day*2;//timeouts for collectors - 48 hours for initial ping, 12 hours for clarification
const clarificationTimeout = data.day/2
var collectors; //global variable tracking current number of collectors
var allPostingChannels;//global variable tracking the posting channels

const startUp = ()=>{
    collectors = 0;//start collector value at 0

    //set up posting channels
    const galleryChannel = client.channels.cache.get(process.env.GALLERYCHANNELID); //get gallery channel
    const victoriaChannel = client.channels.cache.get(process.env.VICTORIACHANNELID); 
    allPostingChannels = [galleryChannel, victoriaChannel];//get both (narrow to just gallery later based on user selection)
}

const artCollector = async (client, artMessage, botResponse, reinitialize) => {
    //takes in the art post, the bot's response message, collector tracker, and whether this is a new collector or a reinitialization
    //whole art post is needed, its contents are relevant for posting and unspoilering

    var yesDetected=false; //set up emoji tracker variables
    var spoilerDetected=false;
    var victoriaDetected=false;
    var doneDetected = false;

    if(reinitialize){//check emoji on reinitialize - collector may not be needed
        console.log("checking existing emoji")
    }

    const collectorFilter = (reaction, user) => {//filter for specific emoji and original poster
        return (reaction.emoji.name === helpers.yEmoji || reaction.emoji.name === helpers.spoilerEmoji || reaction.emoji.name === helpers.victoriaEmoji || 
            reaction.emoji.name === helpers.checkEmoji) &&user.id === artMessage.author.id;
      };
      const collector = botResponse.createReactionCollector({ filter: collectorFilter, time: mainTimeout, dispose: true}); //watch the message for the right emoji
      collectors = await data.collectorsUp(collectors, botResponse.channelId, botResponse.id, true);//increment active collectors and report (do add to file)

      //end on detecting ✅, record detecting the others
      collector.on('collect', async (reaction, user) => {
        if (!yesDetected && reaction.emoji.name === helpers.yEmoji) yesDetected=true; //use detector vars to know when they're clicked
        if (!spoilerDetected && reaction.emoji.name === helpers.spoilerEmoji) spoilerDetected=true;
        if (!victoriaDetected && reaction.emoji.name === helpers.victoriaEmoji) victoriaDetected=true;
        
        if (!doneDetected && reaction.emoji.name === helpers.checkEmoji) {
          doneDetected=true; //this one only reacts the first time and doesn't care if it's removed
          collector.stop();//turn off the collector after it receives this emoji
        }
      });

      collector.on('remove', (reaction) => {
        if (yesDetected && reaction.emoji.name === helpers.yEmoji) yesDetected=false; //toggle detector vars on remove
        if (spoilerDetected && reaction.emoji.name === helpers.spoilerEmoji) spoilerDetected=false;
        if (victoriaDetected && reaction.emoji.name === helpers.victoriaEmoji) victoriaDetected=false;
      });
      
      collector.on('end', async (collected, reason) => {//edit instruction message on collector stop
        var editTrackerFile = true; //defaults to true - normal behavior is to edit collector tracker on stop
        var unspoiler = false;//unspoiler defaults to false

        //check unspoiler status (break up status and collector creation to make file tracking possible)
        if(yesDetected && !spoilerDetected){//if they did *not* spoiler (but they did say yes, it doesn't otherwise matter) check if any images are spoilered
          const filenames = artMessage.attachments.map((a)=>{return a.url.split('/').pop()}) //array of filenames
          const spoilerFiles = filenames.filter(file => file.includes("SPOILER_")); //subset of array that contains the number that are already spoilered
          if(spoilerFiles.length>0){unspoiler = true;} //spoiler on image even though spoiler not selected - unspoiler condition is flagged
        }                

        //check if there's going to be another collector opening up
        if(spoilerDetected || unspoiler){editTrackerFile = false}//in the two conditions where more clarification is needed, don't remove that post link from the tracking list

        collectors = await data.collectorsDown(collectors, botResponse.channelId, botResponse.id, editTrackerFile);//decrement active collectors on end and report
        //file edit is conditional on spoiler conditions - don't remove the post link if another collector is about to start on the exact same post

        var replaceMessage;//determine the new message to edit the post to
        if(reason === 'time' && !yesDetected){replaceMessage = data.timeout}//indicate timeout stop if no 🇾 response
        else if(reason === 'user' || (reason === 'time' && yesDetected)){//when a user stops the collector, or it times out with yes, post the image and edit the message
          
        //   var confirmationMessage = data.noMessage; //default response is no 
          var spoilerTag; //needs to exist as blank even when not updated

          if(unspoiler){//unspoiler clarification check follows from earlier logic check

            //edits the prompt and reacts to its own message
            await botResponse.edit({content: data.unspoilerCheck})
            botResponse.react(helpers.yesEmoji); 
            botResponse.react(helpers.noEmoji); 

            //run response collector, return unspoiler and collector tracking (false for initialization)
            unspoiler = await unspoilerCollector(artMessage, botResponse, false);
            //unspoiler is reused safely because it gets a new default in the collector function
          }
          else if(spoilerDetected){//if they chose spoiler, ask them for a spoiler tag to use
            await botResponse.edit({content: data.spoilerMessage})//edit its message to ask for spoiler text
            botResponse.react('🇳'); //add reaction

            //run response collector, return unspoiler and collector tracking (false for initialization)
            spoilerTag = await spoilerCollector(artMessage, botResponse, false);
            }
        
            //feed all collected data into finish and post function!
            finishAndPost(reason, artMessage, botResponse, yesDetected, spoilerDetected, victoriaDetected, unspoiler, spoilerTag);//make the post!
        }

    });
}

const finishAndPost = async(reason, artMessage, botResponse, yesDetected, spoilerDetected, victoriaDetected, unspoiler, spoilerTag)=>{
    //takes in an end reason (either custom or from collector ending) and the data needed to post

    if(reason === 'user' || (reason === 'time' && yesDetected) || reason === data.manualEndReason){
        //when a user stops the collector, or it times out with yes, or this function was triggered elsewhere, post the image and edit the message
        
        var confirmationMessage = data.noMessage; //default response is no 

        //if yes, make the posts!
        if(yesDetected){
            var postingChannels = allPostingChannels;//get all the posting channels (in format [gallery, victoria])
            if(!victoriaDetected) {//if not crossposting, limit to just the gallery channel
                postingChannels = allPostingChannels[0];
            }
            confirmationMessage = await postImage(artMessage, postingChannels, spoilerDetected, spoilerTag, unspoiler); //post to channels and return links to posts!
          }
          replaceMessage = confirmationMessage//prepare to edit in the message
        }
        else{replaceMessage = data.genericEndMessage}//any other collector end reason gets a default response
  
        botResponse.edit({content: replaceMessage, embeds: []});//edit in final message status

}

const unspoilerCollector = async (artMessage, botResponse, reinitialize)=>{
    //takes in the art post's author, the bot's response message, collector tracker, and whether this is a new collector or a reinitialization

    var finished = false;//stopper variable for secondary collector waiting
    var unspoiler = false; //default is *not* to unspoiler

    //tracking variables for reinitialization case
    var unspoilerYes= false;
    var unspoilerNo = false;
    var yesDetected=false; //emoji tracker variables for reinitialization case, default false
    var spoilerDetected=false;
    var victoriaDetected=false;
    var collectorNeeded = true; //whether to run the collector at all - defaults true

    if(reinitialize){//check emoji on reinitialize - collector may not be needed
        botResponse.reactions.cache.forEach(async(reaction)=>{//iterate through existing reactions - listen for the original three and the two specific to this case
            if(reaction.emoji.name === helpers.yesEmoji || reaction.emoji.name === helpers.noEmoji || reaction.emoji.name === helpers.yEmoji || 
                reaction.emoji.name === helpers.spoilerEmoji || reaction.emoji.name === helpers.victoriaEmoji){
                const reactors = await reaction.users.fetch();//get the people who reacted
                reactors.forEach(async (id)=>{//for each person who used each emoji
                    if(id==artMessage.author.id){//only care about emoji from the artist
                        if(reaction.emoji.name === helpers.yesEmoji) unspoilerYes = true//save emoji values
                        else if (reaction.emoji.name === helpers.noEmoji) unspoilerNo = true    
                        else if (reaction.emoji.name === helpers.spoilerEmoji) spoilerDetected = true    
                        else if (reaction.emoji.name === helpers.victoriaEmoji) victoriaDetected = true    
                        else if (reaction.emoji.name === helpers.yEmoji) yesDetected = true    
                    }
                })
            }
        })
        //if there is only yes or only no, unspoiler can end here and return the answer
        if (unspoilerYes != unspoilerNo){//if they aren't the same, one is true and the other false
            unspoiler = unspoilerYes;//unspoiler = unspoilerYes (false if no is true, as it should be)
            collectorNeeded = false;
        }
        //the other cases are none or both (track remove) - either way run collector as normal but post at the end
    }

    if(collectorNeeded){//don't collect unless needed
        collectors = await data.collectorsUp(collectors, botResponse.channelId, botResponse.id, false);//increment active collectors and report (don't add to file for clarification collector)

        const unspoilerFilter = (reaction, user) => {return ((reaction.emoji.name === helpers.yesEmoji || reaction.emoji.name === helpers.noEmoji) && user.id === artMessage.author.id)};//filter for emojis by original poster
        const unspoilerCollector = botResponse.createReactionCollector({ filter: unspoilerFilter, time: clarificationTimeout, dispose: true}); //bot watches for a reaction

        unspoilerCollector.on('collect', (reaction) => {//on any collection, detect which then stop and move on - only need one result
            if(reaction.emoji.name === helpers.yesEmoji) unspoiler = true;
            unspoilerCollector.stop();
            finished = true; //callback flag for bot to move on
        });

        unspoilerCollector.on('collect', (reaction) => {//on removal, if both were already selected, detect which then stop and move on
            if(unspoilerYes && unspoilerNo){//if both
                if(reaction.emoji.name === helpers.yesEmoji) unspoiler = false;
                if(reaction.emoji.name === helpers.noEmoji) unspoiler = true;//opposite responses since these are removals
                unspoilerCollector.stop();
                finished = true; //callback flag for bot to move on
            }
        });
                    
        unspoilerCollector.on('end', async ()=>{collectors = await data.collectorsDown(collectors, botResponse.channelId, botResponse.id, true);});//decrement active collectors and report (edit file, no longer tracking post)                 
                    
        await data.waitFor(_ => finished === true);//waits for finished to be true, which happens when collector has gotten an answer and close
    }
    if(reinitialize){
        //if it's a reinitialization, run finish and post here
        var reason = data.manualEndReason;
        var spoilerTag;//should be undefined
        finishAndPost(reason, artMessage, botResponse, yesDetected, spoilerDetected, victoriaDetected, unspoiler, spoilerTag);
    }

    return unspoiler;//return unspoiler status
}

const spoilerCollector = async (artMessage, botResponse, reinitialize)=>{
    //takes in the art post's author, the bot's response message, collector tracker, and whether this is a new collector or a reinitialization

    var finished = false;//stopper variable for secondary collector waiting

    if(reinitialize){//check emoji on reinitialize - collector may not be needed
        console.log("checking existing emoji")
    }

    const noFilter = (reaction, user) => {return (reaction.emoji.name === '🇳' && user.id === artMessage.author.id)};//filter for 🇳 emoji by original poster
    const replyFilter = (reply) => {return (artMessage.author.id === reply.author.id && reply.reference && reply.reference.messageId === botResponse.id)};//filter for a reply from the poster to the bot
    const replyCollector = botResponse.channel.createMessageCollector({filter: replyFilter, time: clarificationTimeout, dispose: true, max: 1})//message collector watches for just the first applicable reply
    const noCollector = botResponse.createReactionCollector({ filter: noFilter, time: clarificationTimeout, dispose: true}); //reaction collector watches for a 🇳
    collectors = await data.collectorsUp(collectors, botResponse.channelId, botResponse.id, false);//increment active collectors and report (don't add to file for clarification collector)
    var spoilerTag;

    noCollector.on('collect', () => {
        noCollector.stop();//stop and move on if the reaction filter collects anything (since it's already filtered down to the one emoji)
        replyCollector.stop();
    }) //stop reply collector, too

    replyCollector.on('collect', async (replyMessage) => {//collect reply message if one is detected
        spoilerTag = await replyMessage.content;
    })
    await replyCollector.on('end', async ()=>{
        noCollector.stop() //make sure both collectors stop  
        collectors = await data.collectorsDown(collectors, botResponse.channelId, botResponse.id, true);//decrement active collectors and report (edit file, no longer tracking post)
        finished = true;//when it stops waiting for replies it is done
    })

    await data.waitFor(_ => finished === true);//waits for finished to be true, which happens when collectors have gotten their answers and closed

    return spoilerTag;//return spoiler tag for use in posting
}

module.exports = {artCollector, unspoilerCollector, spoilerCollector, startUp};