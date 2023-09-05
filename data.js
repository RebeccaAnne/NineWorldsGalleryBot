module.exports = {
     artResponseMessage: "Hi! It looks like you posted some art! Please react with 🇾 if you want me to put it in my gallery. (You can edit it there later if you'd like.)\n\n" +
    	"You can use 🔒 to tell me to spoiler it when I post it. If you add ✍️, I\'ll share it with Victoria as well.\n\n" +
    	"When you're done telling me things, or if you don't want me to post anything, just click ✅.",
    noMessage: "Okay, I won't post it to the gallery. Thanks for telling me!",
    noImageMessage: "Sorry, I don't see any images there for me to record.",
    yesMessage: (spoiler, victoria)=>{ //posting message is dependent on the spoiler and victoria toggles
        var yesMessage = "Got it! I'll post it right away"; //basic text
        if (spoiler||victoria) yesMessage += ", and I'll be sure to "; //extension
        if (spoiler) yesMessage += "spoiler it"; //if spoiler
        if (spoiler && victoria) yesMessage += " and "; //if both
        if (victoria)yesMessage += "share it with Victoria"; //if victoria
        yesMessage +="!"; //end
        return yesMessage;
    },
    day: 24*60*60*1000,//24 hours in milliseconds
    generateLink: (guild, channel, message)=>{
        return ["https://discord.com/channels",
            guild,
            channel,
            message].join("/"); //discord links have a standard format
    },
    parseLink: (link)=>{
        var fields = link.split('/')//discord links are a series of ids separated by slashes - discord/server/channel/message
		const messageId = fields.pop(); //id is the last field 
		const channelId = fields.pop(); //channel is the next to last
        return [messageId, channelId];
    }
};