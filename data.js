module.exports = {
     artResponseMessage: "Hi! It looks like you posted some art! Please react with 🇾 if you want me to put it in the gallery.\n\n" +
    	"You can use 🔒 to tell me to spoiler it when I post it. If you add ✍️, I\'ll share it with Victoria as well.\n\n" +
        "You'll be able to update the title and description in the gallery later if you need to.\n\n"+
    	"When you're done telling me things, or if you don't want me to do anything, just click ✅.",
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
    }
};