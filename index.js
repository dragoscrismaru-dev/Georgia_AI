require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    REST,
    Routes
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

// ==================== CONFIG ====================
const PREFIX = "-";
const MOD_CHANNEL_ID = process.env.MOD_CHANNEL_ID;

const BANNED_WORDS = [
    "nigger", "nigga", "faggot", "kike", "chink", "spic", "wetback",
    "retard", "tranny", "coon", "jigaboo", "porchmonkey"
].map(w => w.toLowerCase());
// ===============================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message]
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const memory = new Map();
const queues = new Map();
const players = new Map();

// Register Slash Command
async function registerCommands() {
    const commands = [{
        name: "ask",
        description: "Ask the AI a question",
        options: [{ name: "question", description: "Your question", type: 3, required: true }]
    }];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log("✅ Slash commands registered!");
    } catch (error) {
        console.error("❌ Failed to register commands:", error);
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await registerCommands();
});

// AI Function
async function askAI(userId, message) {
    if (!memory.has(userId)) memory.set(userId, []);
    const history = memory.get(userId);
    history.push({ role: "user", content: message });

    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: "You are a helpful Discord AI assistant." }, ...history]
    });

    const answer = response.choices[0].message.content;
    history.push({ role: "assistant", content: answer });
    if (history.length > 20) history.splice(0, 2);
    return answer;
}

// Racist Filter
function containsBannedWord(text) {
    const lower = text.toLowerCase();
    return BANNED_WORDS.some(word => lower.includes(word));
}

// Music: Play Song
async function playSong(guild) {
    const queue = queues.get(guild.id);
    if (!queue || queue.length === 0) return;

    const voiceChannel = guild.members.me.voice.channel;
    if (!voiceChannel) return;

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator
    });

    const song = queue[0];
    const stream = await play.stream(song.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type });

    let player = players.get(guild.id);
    if (!player) {
        player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
        });
        players.set(guild.id, player);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            queue.shift();
            if (queue.length > 0) playSong(guild);
            else connection.destroy();
        });
    }

    player.play(resource);
    console.log(`🎵 Now playing: ${song.title}`);
}

// Main Message Handler
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const modChannel = message.guild?.channels.cache.get(MOD_CHANNEL_ID);

    // Racism Filter
    if (containsBannedWord(content)) {
        await message.delete().catch(() => {});
        if (modChannel) {
            modChannel.send(`🚨 **RACIST MESSAGE DETECTED** 🚨\n**User:** ${message.author.tag}\n**Channel:** \( {message.channel}\n**Content:** || \){content}||`);
        }
        return message.channel.send(`${message.author}, racist language is not allowed.`).catch(() => {});
    }

    if (!content.startsWith(PREFIX)) return;

    const args = content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // === AI Commands ===
    if (command === "ask" || message.mentions.has(client.user)) {
        const question = args.join(" ") || content.replace(`<@${client.user.id}>`, "").trim();
        if (!question) return;
        await message.channel.sendTyping();
        const reply = await askAI(message.author.id, question);
        return message.reply(reply);
    }

    // === Music Commands ===
    const queue = queues.get(message.guild.id) || [];
    queues.set(message.guild.id, queue);

    if (command === "play") {
        const search = args.join(" ");
        if (!search) return message.reply("❌ Please provide a song name or URL!");

        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) return message.reply("❌ You must be in a voice channel!");

        try {
            const result = await play.search(search, { limit: 1 });
            const song = result[0];

            queue.push({ title: song.title, url: song.url, duration: song.duration });
            message.reply(`✅ Added to queue: **${song.title}**`);

            if (queue.length === 1) {
                playSong(message.guild);
            }
        } catch (e) {
            message.reply("❌ Could not find that song.");
        }
    }

    else if (command === "skip") {
        const player = players.get(message.guild.id);
        if (player) player.stop();
        message.reply("⏭️ Skipped current song.");
    }

    else if (command === "queue") {
        if (queue.length === 0) return message.reply("Queue is empty.");
        const q = queue.map((s, i) => `${i+1}. ${s.title}`).join("\n");
        message.reply(`**Current Queue:**\n${q}`);
    }

    else if (command === "pause") {
        const player = players.get(message.guild.id);
        if (player) player.pause();
        message.reply("⏸️ Paused.");
    }

    else if (command === "resume") {
        const player = players.get(message.guild.id);
        if (player) player.unpause();
        message.reply("▶️ Resumed.");
    }

    else if (command === "stop" || command === "leave") {
        const player = players.get(message.guild.id);
        if (player) player.stop();
        queues.delete(message.guild.id);
        players.delete(message.guild.id);
        message.reply("🛑 Stopped music and left the channel.");
    }

    else if (command === "clear") {
        queues.set(message.guild.id, []);
        message.reply("🧹 Queue cleared.");
    }
});

// Slash Command
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "ask") {
        await interaction.deferReply();
        const answer = await askAI(interaction.user.id, interaction.options.getString("question"));
        interaction.editReply(answer);
    }
});

client.login(process.env.DISCORD_TOKEN);
