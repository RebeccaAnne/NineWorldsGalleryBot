require('dotenv').config();
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { data, helpers } = require('./data.js');
const { artCollector, startUp, unspoilerCollector, spoilerCollector } = require('./collectors.js');
const { Mutex } = require('async-mutex');

const client = new Client({//set up basic context with relevant action permissions
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
});

//set up commands on startup
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');//find all the js files in the command subfolder
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {//initialize each command 
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  // each command that has the right info is added to the Collection with the key as the command name and the value as the exported module
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

client.login(process.env.TOKEN);//start bot

client.on(Events.InteractionCreate, async interaction => {//execute slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

client.on("ready", async () => {//when the bot first logs in
  console.log(`Logged in as ${client.user.tag}!`)
  await startUp(client);//set collector counter and prep gallery channel reference on bot start

  var reinitializedPosts = 0;//counters
  var processed = 0;
  var droppedPosts = []

  //connect to message list file on startup and parse the discord links
  fs.readFile(helpers.filename, async (err, contents) => {
    if (err) console.log(err);//log error if any
    var cachedLinks = contents.toString().replaceAll("\r", "").split("\n");//trim and split to make neat list
    for (iLink = 0; iLink < cachedLinks.length; iLink++) {
      var link = cachedLinks[iLink];
      if (data.linkRegex.test(link)) {//check if the link parses
        var [cachedMessageId, cachedChannelId] = data.parseLink(link); //parse link
        var cachedChannel;
        try { cachedChannel = await client.channels.cache.get(cachedChannelId); } catch { return };//get channel or skip
        if (cachedChannel.viewable) {//channel should be viewable
          var cachedPost
          try { cachedPost = await cachedChannel.messages.fetch(cachedMessageId); } catch { return };//get message or skip
          //should be a bot post without art or embeds that is not in a gallery
          if (cachedPost.embeds.length < 1 && cachedPost.attachments.size < 1 && cachedPost.author.id == process.env.BOTID) {
            const repliedTo = cachedPost.reference; //reference to the replied to message (cached post should be a bot reply to art)
            if (repliedTo) {//check that the reference exists
              var artMessage;
              try { artMessage = await cachedChannel.messages.fetch(repliedTo.messageId); } catch { return }//get referenced message or skip
              if (artMessage.attachments.size > 0 && artMessage.author.id != process.env.BOTID) {//check that the reference message has art and is not by the bot

                // The code in here depends on the strings not changing! I changed the strings and... oh no. 
                // This was the fix-it code to get us back on track. Sometime in the future i should make this
                // NOT depend on the strings not changing
                // if(cachedPost.content == data.genericEndMessage)
                // {
                //   await cachedPost.edit({content:data.artResponseMessage(artMessage.author.id)});
                //   console.log("Fixing post " + link)
                // }

                var howLongAgo = Date.now() - cachedPost.createdTimestamp;
                var yesDetected = false

                if (cachedPost.reactions.cache.has(helpers.yEmoji)) {
                  var reaction = cachedPost.reactions.cache.get(helpers.yEmoji)
                  const reactors = await reaction.users.fetch();//get the people who reacted
                  if (reactors.has(artMessage.author.id)) {
                    console.log("Yes detected for " + link);
                    yesDetected = true
                  }
                }

                //use the content of the bot's post to determine its status, then run respective collectors with reinitialize flag
                if (howLongAgo > data.day * 2 && yesDetected == false) {

                  await cachedPost.edit({ content: data.timeout });
                  droppedPosts.push(link);//drop 1 - different tracking number

                  console.log("Dropping post for timeout: " + link)
                  console.log("Now is " + Date.now())
                  console.log("Post is " + cachedPost.createdTimestamp)
                  console.log("How long ago " + howLongAgo)
                  console.log("48 hours " + data.day * 2)
                }
                else if (cachedPost.content === data.artResponseMessage(artMessage.author.id)) {
                  artCollector(artMessage, cachedPost, true)
                  reinitializedPosts++;
                }
                else if (cachedPost.content === data.spoilerMessage) {
                  spoilerCollector(artMessage, cachedPost, true)
                  reinitializedPosts++;
                }
                else if (cachedPost.content === data.unspoilerMessage) {
                  unspoilerCollector(artMessage, cachedPost, true);
                  reinitializedPosts++;
                }
                else {//if it got this far and nothing matched, edit post with unwatch message
                  console.log("Dropping post " + link);
                  await cachedPost.edit({ content: data.genericEndMessage });
                  droppedPosts.push(link);//drop 1 - different tracking number
                }
              }
            }
          }
        }
      }
      processed++;//count processed links after all ifs/awaits (tracks whether the loop is done)
      if (processed === cachedLinks.length) {
        //after processing it all, log count and dump file
        console.log(`Restarting monitoring of ${reinitializedPosts} ` + (reinitializedPosts === 1 ? "post" : "posts" + "!"));
        //if any were simply dropped
        if (droppedPosts.length > 0) console.log(`Edited ${droppedPosts.length} untracked ` + (droppedPosts === 1 ? "post" : "posts" + "!"));
      }
    }

    // Remove all the dropped links from the file
    for (var iDroppedPost = 0; iDroppedPost < droppedPosts.length; iDroppedPost++) {
      link = droppedPosts[iDroppedPost];
      await data.getMutex().runExclusive(async () => {
        const updatedContents = contents.toString().replace(link, "").trim();//replace first instance of that link in the file with nothing
        fs.writeFile(helpers.filename, updatedContents, (err) => { if (err) console.log(err); })//overwrite file with updated contents
      })
    }
  })
})

client.on("messageCreate", async pingMessage => {//respond to messages where the bot is pinged and there is art

  if (pingMessage.mentions.has(process.env.BOTID, { ignoreRepliedUser: true, ignoreEveryone: true })) {//if bot is mentioned (ignore replies and @here/@everyone)

    const pingChannel = pingMessage.channel; //the channel it was pinged in
    const repliedTo = pingMessage.reference; //the referenced (replied to) message if any
    let artMessage;
    let repliedMessage;
    let gdocMessage;

    if (repliedTo) {//if there is a reply reference, find the reply message
      repliedMessage = await pingChannel.messages.fetch(repliedTo.messageId);
    }

    if (repliedTo && repliedMessage.attachments.size > 0 && repliedMessage.author.id != process.env.BOTID) {
      // If there is an image in the replied to message, and it wasn't posted by this bot, choose that message
      artMessage = repliedMessage;
    }
    else if (pingMessage.attachments.size > 0 && pingMessage.author.id != process.env.BOTID) {
      // Check if the message in which the bot was pinged has art
      artMessage = pingMessage;
    }
    else if (repliedTo && repliedMessage.content.includes("docs.google.com")) {
      // check the replied message for gdocs
      gdocMessage = repliedMessage
    }
    else if (repliedTo && repliedMessage.content.includes("docs.google.com")) {
      // Check the pinged message for gdocs
      gdocMessage = pingMessage
    }

    let postDescription = artMessage ? data.artDescription : data.gDocDescription;
    let message = artMessage ? artMessage : gdocMessage;

    if (message) {
      // We found art or a gdoc!
      message.reply(data.artResponseMessage(postDescription, message.author.id)).then(async (botResponse) => {//send the message, including user reference
        botResponse.react(helpers.yEmoji);
        botResponse.react(helpers.nsfwEmoji);
        botResponse.react(helpers.spoilerEmoji);
        botResponse.react(helpers.checkEmoji);//bot reacts to its own message with all the emojis

        //initialize collector (the function will post, it doesn't need data return but does need client context)
        artCollector(message, botResponse, false);
      });
    }
    else pingMessage.reply(data.noImageMessage); //report if no images/gdocs found in either ping message or reply
  }
});