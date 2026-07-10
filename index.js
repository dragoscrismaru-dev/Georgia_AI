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
const lastBotMessages = new Map(); // Track last message per channel

// Safe long message sender
function sendLongMessage(channel, text) {
    if (text.length <= 2000) {
        return channel.send(text).then(msg => {
            lastBotMessages.set(channel.id, msg);
        });
    }
    const chunks = text.match(/.{1,1900}/gs) || [];
    chunks.forEach((chunk, i) => {
        setTimeout(() => {
            channel.send(chunk).then(msg => {
                if (i === chunks.length - 1) lastBotMessages.set(channel.id, msg);
            });
        }, i * 700);
    });
}

// Owner Code Access
async function showCode(message) {
    if (message.author.id !== OWNER_ID) {
        await message.reply("⛔ Unauthorized access! Shutting down...");
        process.exit(1);
    }
    const code = fs.readFileSync(__filename, "utf8");
    sendLongMessage(message.channel, "```js\n" + code + "\n```");
}

// GitHub Update
async function updateBot(message) {
    if (message.author.id !== OWNER_ID) return message.reply("⛔ Access Denied.");
    message.reply("🔄 Pulling update from GitHub...");
    exec("git pull", (err) => {
        if (err) return message.reply("❌ Update failed.");
        message.reply("✅ Updated! Restarting...");
        process.exit(0);
    });
}

// Jarvis Delete - Delete last bot message
async function jarvisDelete(message) {
    const lastMsg = lastBotMessages.get(message.channel.id);
    if (lastMsg) {
        await lastMsg.delete().catch(() => {});
        lastBotMessages.delete(message.channel.id);
        message.reply("🗑️ Deleted last message.").then(m => setTimeout(() => m.delete(), 3000));
    } else {
        message.reply("❌ No recent message to delete.");
    }
}

// Play Song
async function playSong(guild, textChannel) {
    const queue = queues.get(guild.id);
    if (!queue || queue.length === 0) return;

    const song = queue[0];
    const msg = await textChannel.send(`🎵 **Now Playing:** ${song.title}`);
    lastBotMessages.set(textChannel.id, msg);

    // ... rest of play logic
}

// AI Function
async function askAI(userId, message, guild, textChannel) {
    // ... same as previous
}

// Main Handler
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const lower = content.toLowerCase();

    if (BANNED_WORDS.some(w => lower.includes(w))) {
        await message.delete().catch(() => {});
        return message.channel.send(`${message.author}, that word is not allowed.`);
    }

    // Special Commands
    if (lower === "jarvis delete") return jarvisDelete(message);
    if (content === `${PREFIX}code`) return showCode(message);
    if (content === `${PREFIX}update`) return updateBot(message);

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

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot online as ${client.user.tag}`);
    // Register slash commands...
});

client.login(process.env.DISCORD_TOKEN);
