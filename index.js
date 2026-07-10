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
const MOD_CHANNEL_ID = process.env.MOD_CHANNEL_ID;

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
        new SlashCommandBuilder().setName('ask').setDescription('Ask the AI a question')
            .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)),
        new SlashCommandBuilder().setName('play').setDescription('Play a song')
            .addStringOption(opt => opt.setName('song').setDescription('Song name or URL').setRequired(true)),
        new SlashCommandBuilder().setName('skip').setDescription('Skip current song'),
        new SlashCommandBuilder().setName('queue').setDescription('Show current queue'),
        new SlashCommandBuilder().setName('stop').setDescription('Stop music and leave VC'),
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(cmd => cmd.toJSON()) });
        console.log("✅ Slash commands registered!");
    } catch (error) {
        console.error("Failed to register slash commands:", error);
    }
}

// Helpers
function isServerInfoQuery(text) {
    const t = text.toLowerCase();
    return t.includes("what is this server") || /(what|tell|describe|info).*server/i.test(t);
}

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
    if (history.length > 25) history.splice(0, 4);
    return answer;
}

// Play Song (Fixed VC Join)
async function playSong(guild, textChannel) {
    const queue = queues.get(guild.id);
    if (!queue || queue.length === 0) return;

    const song = queue[0];
    textChannel.send(`🎵 **Now Playing:** ${song.title}`);

    const member = await guild.members.fetch(textChannel.author?.id || textChannel.user?.id).catch(() => null);
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

// MessageCreate (Prefix)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();

    if (BANNED_WORDS.some(word => content.toLowerCase().includes(word))) {
        await message.delete().catch(() => {});
        return message.channel.send(`${message.author}, that word is not allowed.`);
    }

    if (isServerInfoQuery(content)) return message.reply(SERVER_DESCRIPTION);

    if (!content.startsWith(PREFIX)) return;

    const args = content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const queue = queues.get(message.guild.id) || [];
    queues.set(message.guild.id, queue);

    if (command === "play") {
        const search = args.join(" ");
        if (!search) return message.reply("❌ Please provide a song!");

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply("❌ Join a voice channel first!");

        try {
            const result = await play.search(search, { limit: 1 });
            queue.push({ title: result[0].title, url: result[0].url });
            message.reply(`✅ **${result[0].title}** added!`);

            if (queue.length === 1) playSong(message.guild, message.channel);
        } catch (e) {
            message.reply("❌ Could not find song.");
        }
    }
});

// Interaction (Slash Commands)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "ask") {
        await interaction.deferReply();
        const reply = await askAI(interaction.user.id, interaction.options.getString("question"));
        interaction.editReply(reply);
    }

    if (commandName === "play") {
        await interaction.deferReply();
        const search = interaction.options.getString("song");
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) return interaction.editReply("❌ Join a voice channel first!");

        try {
            const result = await play.search(search, { limit: 1 });
            const queue = queues.get(interaction.guild.id) || [];
            queue.push({ title: result[0].title, url: result[0].url });
            queues.set(interaction.guild.id, queue);

            interaction.editReply(`✅ **${result[0].title}** added to queue!`);

            if (queue.length === 1) playSong(interaction.guild, interaction.channel);
        } catch (e) {
            interaction.editReply("❌ Could not find that song.");
        }
    }

    if (commandName === "skip") {
        const player = players.get(interaction.guild.id);
        if (player) player.stop();
        interaction.reply("⏭️ Skipped.");
    }

    if (commandName === "stop") {
        const player = players.get(interaction.guild.id);
        if (player) player.stop();
        queues.delete(interaction.guild.id);
        players.delete(interaction.guild.id);
        interaction.reply("🛑 Stopped music.");
    }
});

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);
