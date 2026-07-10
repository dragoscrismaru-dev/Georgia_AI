require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const Groq = require("groq-sdk");
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior
} = require("@discordjs/voice");

const play = require("play-dl");
const fs = require("fs");
const { exec } = require("child_process");

const PREFIX = "-";
const OWNER_ID = "1408109679782924308";

const SERVER_DESCRIPTION = `This is the **Georgia State Roleplay** server, a community dedicated to providing a realistic and immersive Emergency Response: Liberty County (ER:LC) roleplay experience on Roblox. We offer a range of departments, custom liveries, uniforms, and vehicles, and host daily roleplay sessions and events. Our community is focused on professionalism, realism, and fun, with a strong staff team and a welcoming environment for players of all skill levels. If you're interested in joining, we have opportunities for roleplayers, department leaders, and staff members, so feel free to check us out and see what we're all about!`;

const BANNED_WORDS = ["nigger","nigga","faggot","kike","chink","spic","wetback","retard","tranny","coon","jigaboo","porchmonkey","testn"].map(w => w.toLowerCase());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const memory = new Map();
const queues = new Map();
const players = new Map();
const botMessageHistory = new Map(); // channelId => array of messages

// Send long messages and track them
async function sendLongMessage(channel, text) {
    const messages = [];
    if (text.length <= 2000) {
        const msg = await channel.send(text);
        messages.push(msg);
    } else {
        const chunks = text.match(/.{1,1900}/gs) || [];
        for (const chunk of chunks) {
            const msg = await channel.send(chunk);
            messages.push(msg);
        }
    }
    const history = botMessageHistory.get(channel.id) || [];
    history.push(...messages);
    if (history.length > 30) history.splice(0, history.length - 30);
    botMessageHistory.set(channel.id, history);
}

// Jarvis Delete
async function jarvisDelete(message) {
    const args = message.content.trim().split(/ +/);
    let count = 1;
    if (args[2] && !isNaN(args[2])) count = parseInt(args[2]);

    const history = botMessageHistory.get(message.channel.id) || [];
    if (history.length === 0) return message.reply("❌ No messages to delete.");

    const toDelete = history.slice(-count);
    for (const msg of toDelete) {
        await msg.delete().catch(() => {});
    }
    botMessageHistory.set(message.channel.id, history.slice(0, -count));

    message.reply(`🗑️ Deleted last ${toDelete.length} message(s).`).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
}

// Owner Commands
async function showCode(message) {
    if (message.author.id !== OWNER_ID) {
        await message.reply("⛔ Unauthorized! Shutting down...");
        process.exit(1);
    }
    const code = fs.readFileSync(__filename, "utf8");
    sendLongMessage(message.channel, "```js\n" + code + "\n```");
}

async function updateBot(message) {
    if (message.author.id !== OWNER_ID) return message.reply("⛔ Access Denied.");
    message.reply("🔄 Updating from GitHub...");
    exec("git pull", (err) => {
        if (err) return message.reply("❌ Update failed.");
        message.reply("✅ Updated! Restarting...");
        process.exit(0);
    });
}

// Play Song
async function playSong(guild, textChannel) {
    const queue = queues.get(guild.id);
    if (!queue || queue.length === 0) return;

    const song = queue[0];
    const msg = await textChannel.send(`🎵 **Now Playing:** ${song.title}`);
    const history = botMessageHistory.get(textChannel.id) || [];
    history.push(msg);
    botMessageHistory.set(textChannel.id, history);

    const member = await guild.members.fetch(textChannel.author.id).catch(() => null);
    const voiceChannel = guild.members.me.voice.channel || (member ? member.voice.channel : null);

    if (!voiceChannel) return textChannel.send("❌ Join a voice channel!");

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator
    });

    const stream = await play.stream(song.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type });

    let player = players.get(guild.id);
    if (!player) {
        player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
        players.set(guild.id, player);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            queue.shift();
            if (queue.length > 0) playSong(guild, textChannel);
        });
    }

    player.play(resource);
}

// AI
async function askAI(userId, message, guild, textChannel) {
    if (!memory.has(userId)) memory.set(userId, []);
    const history = memory.get(userId);
    history.push({ role: "user", content: message });

    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: "You are a helpful Discord AI assistant." }, ...history]
    });

    let answer = response.choices[0].message.content;

    history.push({ role: "assistant", content: answer });
    if (history.length > 30) history.splice(0, 6);

    return answer;
}

// Message Handler
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const lower = content.toLowerCase();

    if (BANNED_WORDS.some(w => lower.includes(w))) {
        await message.delete().catch(() => {});
        return message.channel.send(`${message.author}, that word is not allowed.`);
    }

    // Special Commands
    if (lower.startsWith("jarvis delete")) return jarvisDelete(message);
    if (content === `${PREFIX}code`) return showCode(message);
    if (content === `${PREFIX}update`) return updateBot(message);
    if (content === `${PREFIX}help`) {
        return message.reply("**Commands:** Mention me, say `Jarvis`, `/play`, `-play`, `Jarvis delete [number]`");
    }

    let question = null;

    if (message.mentions.has(client.user) || lower.includes("jarvis")) {
        question = content.replace(/<@!?[0-9]+>|\bjarvis\b/gi, "").trim();
    }

    if (question) {
        await message.channel.sendTyping();
        const reply = await askAI(message.author.id, question, message.guild, message.channel);
        sendLongMessage(message.channel, reply);
    }
});

// Slash Commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ask") {
        await interaction.deferReply();
        const reply = await askAI(interaction.user.id, interaction.options.getString("question"), interaction.guild, interaction.channel);
        sendLongMessage(interaction.channel, reply);
    }

    if (interaction.commandName === "play") {
        await interaction.deferReply();
        const songName = interaction.options.getString("song");
        const queue = queues.get(interaction.guild.id) || [];

        try {
            const result = await play.search(songName, { limit: 1 });
            queue.push({ title: result[0].title, url: result[0].url });
            queues.set(interaction.guild.id, queue);
            interaction.editReply(`✅ **${result[0].title}** added to queue!`);
            if (queue.length === 1) playSong(interaction.guild, interaction.channel);
        } catch (e) {
            interaction.editReply("❌ Could not find song.");
        }
    }
});

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot online as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    // Register commands...
});

client.login(process.env.DISCORD_TOKEN);
