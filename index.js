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

// ==================== CONFIG ====================
const PREFIX = "-";

const SERVER_DESCRIPTION = `This is the **Georgia State Roleplay** server, a community dedicated to providing a realistic and immersive Emergency Response: Liberty County (ER:LC) roleplay experience on Roblox. We offer a range of departments, custom liveries, uniforms, and vehicles, and host daily roleplay sessions and events. Our community is focused on professionalism, realism, and fun, with a strong staff team and a welcoming environment for players of all skill levels. If you're interested in joining, we have opportunities for roleplayers, department leaders, and staff members, so feel free to check us out and see what we're all about!`;

const BANNED_WORDS = [
    "nigger", "nigga", "faggot", "kike", "chink", "spic", "wetback",
    "retard", "tranny", "coon", "jigaboo", "porchmonkey", "testn"
].map(w => w.toLowerCase());
// ===============================================

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

// Register Slash Commands
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder().setName("ask").setDescription("Ask the AI").addStringOption(o => o.setName("question").setDescription("Your question").setRequired(true)),
        new SlashCommandBuilder().setName("play").setDescription("Play a song").addStringOption(o => o.setName("song").setDescription("Song name or URL").setRequired(true)),
        new SlashCommandBuilder().setName("skip").setDescription("Skip current song"),
        new SlashCommandBuilder().setName("queue").setDescription("Show current queue"),
        new SlashCommandBuilder().setName("stop").setDescription("Stop music and leave VC")
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
    console.log("✅ Slash commands registered!");
}

// AI Function
async function askAI(userId, message, guild, textChannel) {
    if (!memory.has(userId)) memory.set(userId, []);
    const history = memory.get(userId);
    history.push({ role: "user", content: message });

    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: "You are a helpful Discord AI assistant that can control music." }, ...history]
    });

    let answer = response.choices[0].message.content;

    // Auto-add song if AI detects music request
    if (message.toLowerCase().includes("play") || message.toLowerCase().includes("add to queue")) {
        try {
            const result = await play.search(message, { limit: 1 });
            if (result[0]) {
                const queue = queues.get(guild.id) || [];
                queue.push({ title: result[0].title, url: result[0].url });
                queues.set(guild.id, queue);
                answer += `\n\n✅ Added **${result[0].title}** to the queue!`;
                if (queue.length === 1) playSong(guild, textChannel);
            }
        } catch (e) {}
    }

    history.push({ role: "assistant", content: answer });
    if (history.length > 30) history.splice(0, 6);

    return answer;
}

// Play Song Function
async function playSong(guild, textChannel) {
    const queue = queues.get(guild.id);
    if (!queue || queue.length === 0) return;

    const song = queue[0];
    textChannel.send(`🎵 **Now Playing:** ${song.title}`);

    const member = await guild.members.fetch(textChannel.author.id).catch(() => null);
    const voiceChannel = guild.members.me.voice.channel || (member ? member.voice.channel : null);

    if (!voiceChannel) return textChannel.send("❌ Please join a voice channel first!");

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

// Message Handler
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const lower = content.toLowerCase();

    // Banned words
    if (BANNED_WORDS.some(word => lower.includes(word))) {
        await message.delete().catch(() => {});
        return message.channel.send(`${message.author}, that word is not allowed.`);
    }

    // Server Info
    if (lower.includes("what is this server")) {
        return message.reply(SERVER_DESCRIPTION);
    }

    let question = null;

    // Triggers
    if (message.mentions.has(client.user)) {
        question = content.replace(`<@${client.user.id}>`, "").trim();
    } else if (lower.includes("jarvis")) {
        question = content.replace(/jarvis/gi, "").trim();
    } else if (content.startsWith(PREFIX)) {
        const args = content.slice(PREFIX.length).trim().split(/ +/);
        const cmd = args.shift().toLowerCase();

        const queue = queues.get(message.guild.id) || [];
        queues.set(message.guild.id, queue);

        if (cmd === "help") {
            return message.reply("**Commands:** Mention me, say `Jarvis`, or use `/play`, `/ask`, `/queue`");
        }

        if (cmd === "play") {
            const search = args.join(" ");
            if (!search) return message.reply("❌ Provide a song name!");
            // ... play logic (same as before)
        }

        if (cmd === "queue") {
            if (queue.length === 0) return message.reply("Queue is empty.");
            const list = queue.map((s, i) => `${i+1}. ${s.title}`).join("\n");
            return message.reply(`**Current Queue:**\n${list}`);
        }
    }

    if (question) {
        await message.channel.sendTyping();
        const reply = await askAI(message.author.id, question, message.guild, message.channel);
        message.reply(reply);
    }
});

// Slash Commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ask") {
        await interaction.deferReply();
        const reply = await askAI(interaction.user.id, interaction.options.getString("question"), interaction.guild, interaction.channel);
        interaction.editReply(reply);
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

    if (interaction.commandName === "queue") {
        const queue = queues.get(interaction.guild.id) || [];
        if (queue.length === 0) return interaction.reply("Queue is empty.");
        const list = queue.map((s, i) => `${i+1}. ${s.title}`).join("\n");
        interaction.reply(`**Current Queue:**\n${list}`);
    }

    if (interaction.commandName === "skip" || interaction.commandName === "stop") {
        const player = players.get(interaction.guild.id);
        if (player) player.stop();
        if (interaction.commandName === "stop") {
            queues.delete(interaction.guild.id);
            players.delete(interaction.guild.id);
        }
        interaction.reply(interaction.commandName === "skip" ? "⏭️ Skipped." : "🛑 Stopped.");
    }
});

client.once(Events.ClientReady, async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);
