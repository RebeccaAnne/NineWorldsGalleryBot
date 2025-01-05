require('dotenv').config();
const fs = require('node:fs');
const { Mutex } = require('async-mutex');

let globalMutex;

const helpers = {
    yesEmoji: "👍",
    noEmoji: "👎",
    yEmoji: "🇾",
    nEmoji: "🇳",
    spoilerEmoji: "😈",
    nsfwEmoji: "🍌",
    victoriaEmoji: "✍️",
    checkEmoji: "✅",
    collectorTracker: (verb, collectors) => {
        console.log(`Collector ${verb}. I am currently monitoring ${collectors} collectors.`);
        return collectors;
    },
    hour: 1000 * 60 * 60,//hour in milliseconds,
    generateLink: (guild, channel, message) => {
        return ["https://discord.com/channels",
            guild,
            channel,
            message].join("/"); //discord links have a standard format
    },
    filename: 'watchedPosts.txt',
}

// IMPORTANT NOTE: You CANNOT change these strings while there are active posts being watched! The code will get confused
// if the strings don't match and give up on them!

const data = {
    artResponseMessage: (artistId) => {
        return "Hi, <@" + artistId +
            `>! It looks like you posted some art! Please react with ${helpers.yEmoji} if you want me to put it in my gallery.\n` +
            " (You can delete it or edit the text later with /delete or /edit.)\n\n" +
            `Please use ${helpers.nsfwEmoji} if your post has explicit sexual content. \n` +
            `Please use ${helpers.spoilerEmoji} if your post has content warnings such as noncon or graphic depictions of violence. \n` +
            "(I'll ask for specific tags before posting, and the image will be put behind spoilers in the gallery.)\n\n" +
            `When you're done reacting, or if you don't want me to post, please click ${helpers.checkEmoji} to tell me to move on.`
    },
    noMessage: "Okay, I won't post this image to the gallery. Thanks for telling me!",
    noImageMessage: "Sorry, I don't see any images there for me to record.",
    yesMessage: (spoiler, links) => { //posting message is dependent on the spoiler toggle and post links
        var yesMessage = "Okay, your image is posted to "; //basic text
        if (postLinks.length > 1) { yesMessage += `[both](<${links[0]}>) [galleries](<${links[1]}>)` }
        else { yesMessage += `the [gallery](<${links[0]}>)` } //one or both post links
        if (spoiler) yesMessage += ". I made sure to spoiler it"; //extension
        yesMessage += ". If you need to fix things later, you can always use /edit!"; //end
        return yesMessage;
    },
    unspoilerMessage: "You didn't ask me to add spoilers, but at least one image here is already spoilered. Would you like me to post your art with all image spoilers removed?\n\n" +
        `Please tell me ${helpers.yesEmoji} or ${helpers.noEmoji}`,
    spoilerMessage: "Do you want to add a spoiler tag to the gallery post? You can reply to this post with the spoiler tag.\n\n" +
        `If you use ${helpers.nEmoji} (or ignore me long enough), I'll move on without a tag.`,
    timeout: "I've timed out, so I won't take responses here. Call me again if you need me!",
    genericEndMessage: "I am no longer watching this message. Please call me again if you need me!",
    spoilerField: "Spoiler Tag",//don't change this one, field names should be stable!
    manualEndReason: "manualPost",
    day: 24 * helpers.hour,//24 hours
    ephemeralTimeout: helpers.hour / 2, //half an hour
    linkRegex: /^https:\/\/discord.com\/channels\/[0-9]{17,19}\/[0-9]{17,19}\/[0-9]{17,19}\/?$/,
    parseLink: (link) => {
        var fields = link.split('/')//discord links are a series of ids separated by slashes - discord/server/channel/message
        const messageId = fields.pop(); //id is the last field 
        const channelId = fields.pop(); //channel is the next to last
        return [messageId, channelId];
    },
    waitFor: (condition) => {//conditional waiting function, doesn't move on until it detects its condition
        const poll = resolve => {
            if (condition()) resolve();
            else setTimeout(_ => poll(resolve), 200);//checks every 200 ms
        }
        return new Promise(poll)
    },
    getMutex: () => {
        if (!globalMutex) {
            globalMutex = new Mutex();
        }
        return globalMutex;
    },
    collectorsUp: async (collectors, guildId, channelId, messageId, editFile) => {
        const link = helpers.generateLink(guildId, channelId, messageId) //generate discord link
        if (editFile) {//if editing file, write the link on a new line of the tracker file
            await data.getMutex().runExclusive(async () => {
                fs.appendFile(helpers.filename, link + "\n", (err) => { if (err) console.log(err); });//log error if any
            })
        }
        return helpers.collectorTracker("activated", collectors + 1);
    },//increment collector counter and return
    collectorsDown: async (collectors, guildId, channelId, messageId, editFile) => {
        if (editFile) {//if editing file
            //read in whole file
            await data.getMutex().runExclusive(async () => {
                fs.readFile(helpers.filename, (err, contents) => {
                if (err) console.log(err);//log error if any
                const link = helpers.generateLink(guildId, channelId, messageId) //generate discord link
                const updatedContents = contents.toString().replace(link, "").trim();//replace first instance of that link in the file with nothing
                    fs.writeFile(helpers.filename, updatedContents, (err) => { if (err) console.log(err); })//overwrite file with updated contents
                })
            });
        }
        return await helpers.collectorTracker("stopped", collectors - 1);
    },//decrement collectors and return
    getCrosspost: async (embed, interaction) => {//take a single embed (either builder or existing) and get the crosspost if it's in the links
        const linkField = embed.data.fields.find(f => f.name === "Links").value;
        if (linkField.includes("Gallery")) {//Original or Original / (Victoria's) Gallery
            //get the corresponding post from the links
            var crossLink = linkField.split("(").pop();//get link
            crossLink = crossLink.replace(")", "")//trim end
            const [crossMessageId, crossChannelId] = data.parseLink(crossLink);

            const crossChannel = await interaction.client.channels.fetch(crossChannelId); //get channel
            try { return await crossChannel.messages.fetch(crossMessageId); } //get post and return if found 
            catch { return }//(else return nothing)
        } else {
            return;//return nothing if no crosspost link
        }
    },
    unspoilerCheck: (attachments) => {
        //check unspoiler logic for some image attachments
        var unspoiler = false;
        const filenames = attachments.map((a) => { return a.url.split('/').pop() }) //array of filenames
        const spoilerFiles = filenames.filter(file => file.includes("SPOILER_")); //subset of array that contains the number that are already spoilered
        if (spoilerFiles.length > 0) { unspoiler = true; } //spoiler on image even though spoiler not selected - unspoiler condition is flagged
        return unspoiler;
    }

}

module.exports = { data, helpers };