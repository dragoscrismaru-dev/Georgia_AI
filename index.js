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
const botMessageHistory = new Map(); // channelId => array of bot messages

// Safe long message sender + track messages
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
    // Save to history
    const history = botMessageHistory.get(channel.id) || [];
    history.push(...messages);
    if (history.length > 20) history.splice(0, history.length - 20); // keep last 20
    botMessageHistory.set(channel.id, history);
    return messages;
}

// Jarvis Delete Command
async function jarvisDelete(message) {
    const args = message.content.trim().split(/ +/);
    let count = 1;
    if (args[1] && !isNaN(args[1])) count = parseInt(args[1]);

    const history = botMessageHistory.get(message.channel.id) || [];
    if (history.length === 0) return message.reply("❌ No messages to delete.");

    const toDelete = history.slice(-count);
    for (const msg of toDelete) {
        await msg.delete().catch(() => {});
    }

    // Remove from history
    botMessageHistory.set(message.channel.id, history.slice(0, -count));

    message.reply(`🗑️ Deleted last ${toDelete.length} message(s).`).then(m => setTimeout(() => m.delete(), 4000));
}

// Rest of the code (AI, music, etc.) remains the same as previous version
// ... (I kept it short here for clarity)

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const lower = content.toLowerCase();

    if (BANNED_WORDS.some(w => lower.includes(w))) {
        await message.delete().catch(() => {});
        return message.channel.send(`${message.author}, that word is not allowed.`);
    }

    // Jarvis Delete
    if (lower.startsWith("jarvis delete")) {
        return jarvisDelete(message);
    }

    // ... other commands (mention, prefix, etc.)
});

client.login(process.env.DISCORD_TOKEN);
