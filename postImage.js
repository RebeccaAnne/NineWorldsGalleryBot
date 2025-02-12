const { EmbedBuilder, GuildApplicationCommandManager } = require('discord.js');
require('dotenv').config();
const { data, helpers } = require('./data.js');

async function postImage(artMessage, postingChannels, nsfw, spoiler, spoilerTag, unspoiler) {

    var messageAttachments = artMessage.attachments.size > 0 ? artMessage.attachments : null; //get the attachments

    //get artist id (links post to discord handle and not just artist name)
    artistId = artMessage.author.id;

    //strip @Bot from post content
    var messageContent = artMessage.content.replace(`<@${process.env.BOTID}>`, "");

    const artLink = helpers.generateLink(
        artMessage.guild.id,
        artMessage.channel.id,
        artMessage.id); //create link to original post

    let postingChannel;
    let creatorFieldName;

    //create attachable image and embedded data
    var embeds = [];
    var imageFiles = [];
    if (messageAttachments) {
        // This is art
        creatorFieldName = "Artist";

        messageAttachments.forEach(async attachment => { //prep each image into a file array with spoilers as necessary

            var imageUrl = attachment.url; //get url of actual image
            var filename = (imageUrl.split('/')).pop(); //get the last chunk of the filename as the actual image name

            //there may be ? and parameters in the image url - detect and drop these
            if (filename.includes("?")) filename = filename.replace(/\?.*$/, "")

            if (spoiler && !filename.startsWith("SPOILER_")) filename = "SPOILER_" + filename; //if it needs to be spoilered and isn't already, add the spoilerflag to the filename
            else if (!spoiler && unspoiler && filename.startsWith("SPOILER_")) filename = filename.replace("SPOILER_", "");//if it needs to be unspoilered, remove "SPOILER_"

            imageFiles.push({
                attachment: imageUrl,
                name: filename
            })//add image to array

        });

        postingChannel = nsfw ? postingChannels.nsfwArtChannel : postingChannels.artGalleryChannel;
    }
    else {
        // If there weren't message attachements this is a gdoc. 
        creatorFieldName = "Author";

        // Copy any gdoc embeds from the original message here, putting things under spoilers as
        // necessary (I can't figure out how to spoil a whole embed, alas)
        artMessage.embeds.forEach(originalMessageEmbed => {

            //Yes this string check is probably fragile. :shrug:
            if (originalMessageEmbed.provider.name == "Google Docs") {
                let description = "";

                if (originalMessageEmbed.description) {
                    // If we're spoiling, spoil the preview text in the gdoc embed
                    if (spoiler) {
                        description += "||"
                    }

                    // Add the preview text from the generated embed
                    description += originalMessageEmbed.description;

                    // Close the spoiler tag if necessary
                    if (spoiler) {
                        description += "||"
                    }
                }
                const embed = new EmbedBuilder()
                    .setTitle(originalMessageEmbed.title)
                    .setURL(originalMessageEmbed.url);

                if (description) {
                    embed.setDescription(description)
                }
                
                embeds.push(embed);
            }
        });
        postingChannel = nsfw ? postingChannels.nsfwGdocChannel : postingChannels.gdocGalleryChannel;
    }

    const embed = new EmbedBuilder() //embed posts tagged data, making the gallery entry nice and clean and updatable as needed
        .setColor("#d81b0e")//discord win red
        .addFields({ name: creatorFieldName, value: `<@${artistId}>` })//the author's discord id
        .setTimestamp(artMessage.createdTimestamp);//timestamp of original post

    embeds.push(embed);

    //parse and add description
    if (messageContent.length > 0) {
        let messageDescription = "";
        let addSpoilerBars = false;
        if (spoiler) {
            // If we're spoiling for content warnings, and there aren't any spoiler tags in the message
            // already, spoil the content, just in case.

            // regex to handle |'s as special characters
            addSpoilerBars = (messageContent.search(/\|\|/g) == -1);
            console.log("addSpoilerBars: " + addSpoilerBars);
            if (addSpoilerBars) {
                messageDescription += "||";
            }
        }

        messageDescription += messageContent;
        if (addSpoilerBars) {
            messageDescription += "||";
        }

        embed.setDescription(messageDescription)
    }

    //add spoiler tag as field if tag present and spoiler true
    if (spoiler && spoilerTag) embed.addFields({ name: data.spoilerField, value: spoilerTag })

    embed.addFields({ name: "Link", value: `[Original](${artLink})` });//this one looks good if it's last

    var artPost = { //combine all the art together for multiple similar sends
        embeds: embeds,
        files: imageFiles,
    }

    var galleryLink;
    var galleryPost;
    console.log("Posting to channel: " + postingChannel)
    await postingChannel.send(artPost).then(sent => { //make link to posted message
        galleryLink = helpers.generateLink(sent.guild.id, sent.channel.id, sent.id)
        galleryPost = sent; //save first post
        console.log("Gallery Link: " + galleryLink)
    });

    // This supports the Victoria channel, which we don't have. Revisit this code if we have 
    // a scenario where the same post ends up in more than once place.
    // var victoriaLink;
    // if (postingChannels.length > 1) {//if more than one channel keep going
    //     var originalLink = embed.data.fields.find(f => f.name === "Links").value
    //     artPost.embeds[0].data.fields.find(f => f.name === "Links").value = originalLink + ` / [Gallery](${galleryLink})`;

    //     await postingChannels[1].send(artPost).then(sent => { //make link
    //         victoriaLink = helpers.generateLink(artMessage.guild.id, /*victoriachannelid*/, sent.id)
    //         //now edit the original post with this data
    //         embed.data.fields.find(f => f.name === "Links").value = originalLink + ` / [Victoria's Gallery](${victoriaLink})`;
    //         galleryPost.edit({ embeds: [embed] });//edit first post
    //     });
    // }

    //return from posting with the correct confirmation message
    postLinks = [galleryLink] //formulate and return post links, incl. victoria if applicable
    //if (victoriaLink) postLinks.push(victoriaLink)
    return data.yesMessage(spoiler, postLinks);//formulate the message based on link count / spoilers
}

module.exports = { postImage };