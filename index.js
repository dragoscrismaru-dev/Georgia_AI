require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
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

const SERVER_DESCRIPTION = `This is the **Georgia State Roleplay** server...`; // your full description here

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
const botMessageHistory = new Map();

// Send long message
async function sendLongMessage(channel, text) {
    if (text.length <= 2000) return channel.send(text);
    const chunks = text.match(/.{1,1900}/gs) || [];
    for (const chunk of chunks) await channel.send(chunk);
}

// Jarvis Code Modification (Smart)
async function jarvisModifyCode(message, instruction) {
    if (message.author.id !== OWNER_ID) return message.reply("⛔ Only the owner can modify code.");

    try {
        const currentCode = fs.readFileSync(__filename, "utf8");

        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{
                role: "system",
                content: `You are an expert JavaScript Discord bot developer. Modify the bot code based on the user's request. Return ONLY the full new code.`
            }, {
                role: "user",
                content: `Current code:\n${currentCode}\n\nRequest: ${instruction}\n\nReturn the complete updated code.`
            }]
        });

        const newCode = response.choices[0].message.content.trim();

        if (newCode.length < 500) return message.reply("❌ Failed to generate valid code.");

        fs.writeFileSync(__filename, newCode);
        await message.reply("✅ Code successfully updated based on your request! Restarting bot...");
        process.exit(0);

    } catch (e) {
        message.reply("❌ Failed to modify code: " + e.message);
    }
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

    // Jarvis Commands
    if (lower.startsWith("jarvis delete")) {
        // delete logic...
    }

    if (lower.includes("jarvis code")) {
        if (lower.includes("add") || lower.includes("make") || lower.includes("create")) {
            const instruction = content.replace(/jarvis code (add|make|create)/i, "").trim();
            return jarvisModifyCode(message, instruction);
        }
        // show code
    }

    // Normal Jarvis / Mention
    if (message.mentions.has(client.user) || lower.includes("jarvis")) {
        const question = content.replace(/<@!?[0-9]+>|\bjarvis\b/gi, "").trim();
        await message.channel.sendTyping();
        const reply = await askAI(message.author.id, question, message.guild, message.channel);
        sendLongMessage(message.channel, reply);
    }
});

client.login(process.env.DISCORD_TOKEN);
