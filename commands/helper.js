require('dotenv').config();
const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { data, helpers } = require('../data.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('helper')
		.setDescription('Learn more about G. Bot!'),
	async execute(interaction) {

		//command and explanation text
		const initialResponse = 'Hi! My job is to record your art!\n\n' +
			"If you ping me in an image post or in a reply to an image post, I can add that image to my gallery.\n\n" +
			"You can click the buttons to learn more about how I work.";
		const editText = "If you use /edit and give me a link to one of your art posts in either of my galleries, I can fix it for you!\n\n" +
			"I can only edit the art posts in my galleries, and only when /edit is used by the original artist credited in the gallery post.\n\n" +
			"Currently I can change or remove titles, descriptions, and spoiler tags.\n\n" +
			"Note that remove and change are different - I have text inputs for updating info and True/False inputs for removing it.\n\n" +
			"If the piece is posted in both galleries, I will fix both posts (I do this using the links!).";
		const deleteText = "If you use /delete and give me a link to one of your art posts in one of my galleries, I can remove it for you!\n\n" +
			`Currently this command removes crossposted art from both galleries. ` +
			`If you want to remove only Victoria's copy of a post, you can /delete both and have me repost.`;
		const spoilerText = "Sometimes I need clarification about what people want me to do with spoilers, to make sure my gallery is as well organized as possible.\n\n" +
			"You don't need to spoiler Nine Worlds content in my galleries, but please do spoiler nsfw or potentially upsetting material.\n\n" +
			"If you don't ask me to spoiler an image but it's spoilered in the original post, I'll offer to remove the spoiler. This won't change anything else about the image.\n\n" +
			"If you do ask me to spoiler an image, I'll ask you to reply to me with a spoiler tag. Spoilers are more helpful when people have info about when they're safe to click!"
		const timeoutText = `When I post a response to an artist, I watch the emojis on that post for 48 hours or until I get a ${helpers.checkEmoji} from the artist.\n\n` +
			`If I don't have a ${helpers.yEmoji} from the artist after 48 hours, I don't post anything. If I *do* get a ${helpers.yEmoji} but they never click ${helpers.checkEmoji}, I'll post the art when I finish waiting.\n\n` +
			"If I need clarification about spoiler tags or unspoilering, I'll wait for 12 hours after asking, then post as-is if they don't tell me anything more.\n\n" +
			"When I go offline and come back, I reset the timers for anything I'm still watching, so sometimes I might watch a post for a little longer.\n\n" +
			"I edit posts once I'm no longer watching them so that no one gets confused.";
		const userText = "I check discord user ids when I respond to art, and when I make gallery posts.\n\n" +
			"Only the original poster of an image can consent for me to post it or ask me to edit or delete it. (The mods can always delete things, of course.)\n\n" +
			"If someone else replies to or reacts to a post that I'm watching for the artist's answer, I'll just ignore them.";
		const offlineText = "For obvious reasons, I can't detect emojis, pings, or replies while I'm offline for maintenance.\n\n" +
			"However, I keep track of the posts I'm currently listening to whenever I go down, and I check their emojis when I come back online.\n\n" +
			"Feel free to react to my posts at any time. Even if I'm not answering now, I'll get it later!\n\n" +
			"For arbitrary coding reasons, I have some trouble with emoji being removed after I come back online - you might occasionally have to take one off and re-add it.\n\n" +
			"If I don't respond to a reply or ping, you'll have to send that one again when I'm online. Those are harder to go back for."
		const moreText = "You can click any of these to learn more about how I work!"
		const timeoutMessage = "This command has timed out. Please use /helper again if you would like to see more!"

		//set up array of explanations and buttonids for easy iteration (done is a special case and does not need to be in here)
		const buttonData = [[{ id: 'more', content: moreText }],
		[{ id: 'edit', content: editText }, { id: 'delete', content: deleteText }, { id: 'spoiler', content: spoilerText }],
		[{ id: 'timeout', content: timeoutText }, { id: 'userid', content: userText }, { id: 'offline', content: offlineText }]];
		//only 5 buttons allowed in a row, and one is "more"
		//two sets of three is even right now, could get up to 4 in a row before adding another

		//set up buttons - labels are arbitrary/visual, but ids are referenced again later
		const moreButton = new ButtonBuilder()
			.setCustomId(buttonData[0][0].id)
			.setLabel('More Buttons')
			.setStyle(ButtonStyle.Primary);

		const editButton = new ButtonBuilder()
			.setCustomId(buttonData[1][0].id)
			.setLabel('/edit')
			.setStyle(ButtonStyle.Secondary)

		const deleteButton = new ButtonBuilder()
			.setCustomId(buttonData[1][1].id)
			.setLabel('/delete')
			.setStyle(ButtonStyle.Secondary);

		const spoilerButton = new ButtonBuilder()
			.setCustomId(buttonData[1][2].id)
			.setLabel('spoilers')
			.setStyle(ButtonStyle.Secondary);

		const timeoutButton = new ButtonBuilder()
			.setCustomId(buttonData[2][0].id)
			.setLabel('timeouts')
			.setStyle(ButtonStyle.Secondary);

		const userButton = new ButtonBuilder()
			.setCustomId(buttonData[2][1].id)
			.setLabel('user ids')
			.setStyle(ButtonStyle.Secondary);

		const offlineButton = new ButtonBuilder()
			.setCustomId(buttonData[2][2].id)
			.setLabel("offline")
			.setStyle(ButtonStyle.Secondary);


		const buttonRow1 = new ActionRowBuilder()
			.addComponents(moreButton, editButton, deleteButton, spoilerButton);
		const buttonRow2 = new ActionRowBuilder()
			.addComponents(moreButton, timeoutButton, userButton, offlineButton);
		const buttonRows = [buttonRow1, buttonRow2]; //list makes them iterable with currentRow-1 as index
		var currentRow = 1; //start on row 1, switch on more

		await interaction.reply({
			content: initialResponse,
			components: [buttonRow1],
			ephemeral: true
		}).then((sent) => {
			const buttonCollector = sent.createMessageComponentCollector({ time: data.ephemeralTimeout });//30 min timeout
			buttonCollector.on('collect', async buttonInteraction => {

				if (buttonInteraction.customId === buttonData[0][0].id) {//more
					currentRow++;//add 1 to current row
					if (currentRow > 2) currentRow = 1;//if current row >2, reset to 1 (overflow allows more rows if needed)
					await buttonInteraction.update({ content: moreText, components: [buttonRows[currentRow - 1]] })//change to other row of buttons
				}
				else {
					buttonData[currentRow].forEach(async (button) => {//if it isn't more or done, iterate through buttons on the current row
						if (buttonInteraction.customId === button.id) {//check each id, act on the matching one
							await buttonInteraction.update({ content: button.content })//update text, no need to return or change buttons
						};
					});
				};
			});

			buttonCollector.on('end', async () => {//detect timeout and remove buttons
				if (reason === 'time') await buttonInteraction.update({ content: timeoutMessage, components: [] })
			});
		});
	}
};