require('dotenv').config();
const { data } = require('./data.js');

async function galleryLinkErrors(interaction, action) {

    //parse link
    const link = interaction.options.getString('link');

    //error for bad link
    if (!(data.linkRegex.test(link))) {//not a discord link
        await interaction.reply({//failure response
            content: "I'm sorry, but I don't recognize that link.",
            ephemeral: true
        });
        return //end 
    }

    //parse link to get channel and catch errors
    var [messageId, channelId] = data.parseLink(link);
    var channel;
    try {
        channel = await interaction.client.channels.fetch(channelId);
    } catch {
        await interaction.reply({//failure response
            content: "I'm sorry, but something seems to be wrong with that link.",
            ephemeral: true
        });
        return //end
    }

    //link channel should be one it has access to
    if (!channel.viewable) {
        await interaction.reply({//failure response
            content: "I'm sorry, but that link goes somewhere I cannot.",
            ephemeral: true
        });
        return //end
    }

    var post; //get post, handle errors
    try {
        post = await channel.messages.fetch(messageId);
    } catch {
        await interaction.reply({//failure response
            content: "I'm sorry, but I cannot read that link.",
            ephemeral: true
        });
        return //end
    }

    //get gallery channels
    const galleryChannels = [process.env.VICTORIACHANNELID, process.env.GALLERYCHANNELID]

    //channel should be a gallery channel and poster should be the bot
    if (post.author.id != process.env.BOTID || !(galleryChannels.includes(channelId))) {
        await interaction.reply({//failure response
            content: `I'm sorry, but I can only ${action} art that I've posted in my galleries.`,
            ephemeral: true
        });
        return //end
    }

    if (post.embeds.length < 1 || post.attachments.length < 1) {//post should have at least one embed and at least one attached file
        await interaction.reply({//failure response
            content: `I'm sorry, but that post does not seem to contain art.`,
            ephemeral: true
        });
        return //end
    }

    if (!post.embeds[0].data.fields.find(f => f.name === "Artist").value.includes(interaction.user.id)) {//compare interaction.user.id to author id - only the author in the embed can make the edit
        await interaction.reply({//failure response
            content: `I'm sorry, but you can only ${action} art that you originally posted.`,
            ephemeral: true
        });
        return //end
    }

    return [link, post]//return parsed data
}

module.exports = { galleryLinkErrors };