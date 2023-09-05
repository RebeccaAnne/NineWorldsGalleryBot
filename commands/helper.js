require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder, Client } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('helper')
		.setDescription('What do I do?'),
	async execute(interaction) {
		await interaction.reply({
			content: 'Hi! My job is to asdf your art!\n\nIf you ping me in an image post or in a reply to an image post, I can add that image to my gallery.',
			ephemeral: true
		});
	}
};