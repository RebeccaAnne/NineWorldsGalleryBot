require('dotenv').config();
const moment = require('moment');
const { data } = require('../data.js');
const galleryLinkErrors = require('../galleryLinkErrors.js').galleryLinkErrors;
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('edit')
		.setDescription('Fix the title and/or description of one of your posted pieces')
		.addStringOption(option => option.setName('link')
			.setDescription('Discord link to the posted art (required)')
			.setMinLength(1)
			.setRequired(true))
		.addStringOption(option => option.setName('title')
			.setDescription('Updated title (optional)')
			.setMinLength(1)
			.setMaxLength(256)
			.setRequired(false))
		.addStringOption(option => option.setName('description')
			.setDescription('Updated description (optional)')
			.setMinLength(1)
			.setMaxLength(4096)
			.setRequired(false))
		.addStringOption(option => option.setName('spoiler_tag')
			.setDescription('Updated spoiler tag (optional)')
			.setMinLength(1)
			.setMaxLength(256)
			.setRequired(false))
		.addBooleanOption(option => option.setName('clear_title')
			.setDescription('Remove title from gallery post (optional)')
			.setRequired(false))
		.addBooleanOption(option => option.setName('clear_description')
			.setDescription('Remove description from gallery post (optional)')
			.setRequired(false))
		.addBooleanOption(option => option.setName('clear_spoiler_tag')
			.setDescription('Remove spoiler tag from gallery post (optional)')
			.setRequired(false)),
	async execute(interaction) {

		var link, post; //generate data from link
		try {
			[link, post] = await galleryLinkErrors(interaction, "edit")//try to go parse the link - it's in the interaction data
		} catch (error) { return };//if it can't get the data out, then there was an error handled in the initial interaction and this is done

		//parse title and description
		const title = interaction.options.getString('title') ?? ""; //defaults to empty string
		const description = interaction.options.getString('description') ?? ""; //defaults to empty string
		const spoilerTag = interaction.options.getString('spoiler_tag') ?? ""; //defaults to empty string
		const clearTitle = interaction.options.getBoolean('clear_title') ?? false; //defaults to false
		const clearDescription = interaction.options.getBoolean('clear_description') ?? false; //defaults to false
		const clearSpoiler = interaction.options.getBoolean('clear_spoiler') ?? false; //defaults to false

		//if there isn't a positive response other than the link
		if (title.length < 1 && description.length < 1 && spoilerTag.length < 1 && !clearTitle && !clearDescription && !clearSpoiler) {
			await interaction.reply({//failure response
				content: "I'm sorry, but you do need to give me something to change.",
				ephemeral: true
			});
			return //end

		} else {//actually edit
			var embedData = post.embeds[0].data//original embed data
			const timestamp = moment(embedData.timestamp).valueOf()//parse and convert to unix stamp
			const newEmbed = new EmbedBuilder()//preserve old data
				.setColor(embedData.color)
				.setTimestamp(timestamp)

			if (!clearTitle) {//if clear title, ignore other title info
				if (title.length > 0) newEmbed.setTitle(title) //if title is present, use it
				else if (embedData.title) { newEmbed.setTitle(embedData.title) } //otherwise keep existing title if present
			}

			if (!clearDescription) {//do nothing if clear description true
				if (description.length > 0) { newEmbed.setDescription(description); } //set description if present
				else if (embedData.description) newEmbed.setDescription(embedData.description) //otherwise keep existing description if present
			}

			var newFields = embedData.fields;
			if (clearSpoiler) newFields = newFields.filter(field => field.name != data.spoilerField);//filter spoiler out of fields
			else {
				if (spoilerTag) {//if spoiler not cleared and spoiler tag provided
					if (newFields.find(f => f.name === data.spoilerField)) {//if that field already exists
						newFields.find(f => f.name === data.spoilerField).value = spoilerTag; //update the value
					} else { //if field is not there already add it (but make links be last)
						newFields = newFields.filter(field => (field.name != data.spoilerField && field.name != "Links"));//filter links and spoiler out of fields
						newFields.push({ name: data.spoilerField, value: spoilerTag }) //add spoilers
						newFields.push(embedData.fields.find(f => f.name === "Links")) //add links (last for aesthetics)
					}
				}
			}
			newEmbed.setFields(newFields);//set fields based on existing


			// //image request goes here
			// if(newImageLink.length<1){

			// 	//validate image url
			// 	if (!(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g).test(newImageLink)) {
			// 		await interaction.reply({//failure response
			// 			content: "I'm sorry, but I don't recognize that URL.",
			// 			ephemeral: true
			// 		});
			// 		return //end
			// 	}

			// 	//get existing image content

			// }

			post.edit({ embeds: [newEmbed] });//edit embed

			//check if there is a crosspost - send the embed and the interaction context for searching for a post
			const crossPost = await data.getCrosspost(newEmbed, interaction)
			if (crossPost) {
				const crossLinkData = crossPost.embeds[0].fields.find(f => f.name === "Links").value;
				newEmbed.data.fields.find(f => f.name === "Links").value = crossLinkData;

				crossPost.edit({ embeds: [newEmbed] });//edit crosspost
			}

			await interaction.reply({//success response
				content: `Alright, how does that look? ${link}`,
				ephemeral: true
			});
		};
	},
};