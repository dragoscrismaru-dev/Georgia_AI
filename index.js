require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    REST,
    Routes,
    EmbedBuilder
} = require("discord.js");

const Groq = require("groq-sdk");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require("@discordjs/voice");
const play = require("play-dl");

// ==================== CONFIG ====================
const PREFIX = "-";
const MOD_CHANNEL_ID = process.env.MOD_CHANNEL_ID;

const SERVER_DESCRIPTION = `This is the **Georgia State Roleplay** server, a community dedicated to providing a realistic and immersive Emergency Response: Liberty County (ER:LC) roleplay experience on Roblox. We offer a range of departments, custom liveries, uniforms, and vehicles, and host daily roleplay sessions and events. Our community is focused on professionalism, realism, and fun, with a strong staff team and a welcoming environment for players of all skill levels. If you're interested in joining, we have opportunities for roleplayers, department leaders, and staff members, so feel free to check us out and see what we're all about!`;

const BANNED_WORDS = ["nigger", "nigga", "faggot", "kike", "chink", "spic", "wetback", "retard", "tranny", "coon", "jigaboo", "porchmonkey", "TestN"].map(w => w.toLowerCase());

const HELP_MESSAGE = `**🛠️ Bot Commands**\n\n` +
    `**General:**\n` +
    `\`${PREFIX}help\` - Show this menu\n` +
    `\`${PREFIX}ping\` - Check bot latency\n` +
    `\`${PREFIX}server\` - Server information\n\n` +
    `**AI:**\n` +
    `\`${PREFIX}ask <question>\` or mention the bot\n\n` +
    `**Music:**\n` +
    `\`${PREFIX}play <song>\` - Play music\n` +
    `\`${PREFIX}skip\` - Skip song\n` +
    `\`${PREFIX}queue\` - Show queue\n` +
    `\`\( {PREFIX}pause\` / \` \){PREFIX}resume\` - Pause/Resume\n` +
    `\`${PREFIX}stop\` - Stop music\n` +
    `\`${PREFIX}clear\` - Clear queue\n\n` +
    `Racist messages are automatically removed.`;
// ===============================================

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel, Partials.Message]
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const memory = new Map();
const queues = new Map();
const players = new Map();

// Register Slash Commands
async function registerCommands() {
    // ... same as before
}

// Ready Event
client.once(Events.ClientReady, async () => {
    console.log(`✅ ${client.user.tag} is online!`);
    await registerCommands();
});

// Server Info Query Detection
function isServerInfoQuery(text) {
    const t = text.toLowerCase();
    return /(what|tell|describe|info|about).*?(server|this server|discord|community)/i.test(t) || t.includes("what is this server");
}

// Racist Filter
function containsBannedWord(text) {
    const lower = text.toLowerCase();
    return BANNED_WORDS.some(word => lower.includes(word));
}

// Play Song with "Now Playing" message
async function playSong(guild, textChannel) {
    const queue = queues.get(guild.id);
    if (!queue || queue.length === 0) return;

    const song = queue[0];
    if (textChannel) {
        textChannel.send(`🎵 **Now Playing:** ${song.title}`);
    }

    // ... rest of playSong logic (same as before)
}

// Main Message Handler
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    const content = message.content.trim();
    const modChannel = message.guild?.channels.cache.get(MOD_CHANNEL_ID);

    // Moderation
    if (containsBannedWord(content)) {
        await message.delete().catch(() => {});
        if (modChannel) modChannel.send(`🚨 Racist message from ${message.author.tag}`);
        return message.channel.send(`${message.author}, please don't use racist language.`).catch(() => {});
    }

    if (!content.startsWith(PREFIX) && !message.mentions.has(client.user)) return;

    const args = content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    // Help
    if (command === "help") return message.reply(HELP_MESSAGE);

    // Ping
    if (command === "ping") {
        const latency = Date.now() - message.createdTimestamp;
        return message.reply(`🏓 Pong! Bot latency: **${latency}ms**`);
    }

    // Server Info
    if (command === "server" || isServerInfoQuery(content)) {
        const embed = new EmbedBuilder()
            .setTitle(message.guild.name)
            .setDescription(SERVER_DESCRIPTION)
            .addFields(
                { name: "Members", value: `${message.guild.memberCount}`, inline: true },
                { name: "Created", value: message.guild.createdAt.toDateString(), inline: true }
            )
            .setColor(0x00ff00);
        return message.reply({ embeds: [embed] });
    }

    // AI
    if (command === "ask" || message.mentions.has(client.user)) {
        const question = args.join(" ") || content.replace(`<@${client.user.id}>`, "").trim();
        if (!question) return;
        await message.channel.sendTyping();
        const reply = await askAI(message.author.id, question);
        return message.reply(reply);
    }

    // Music Commands (play, skip, queue, etc.)
    // ... (keep your music logic here)
});

client.login(process.env.DISCORD_TOKEN);
