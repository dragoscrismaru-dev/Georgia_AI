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

// Customize this description for your server
const SERVER_DESCRIPTION = `This is the **Georgia State Roleplay** server, a community dedicated to providing a realistic and immersive Emergency Response: Liberty County (ER:LC) roleplay experience on Roblox. We offer a range of departments, custom liveries, uniforms, and vehicles, and host daily roleplay sessions and events. Our community is focused on professionalism, realism, and fun, with a strong staff team and a welcoming environment for players of all skill levels. If you're interested in joining, we have opportunities for roleplayers, department leaders, and staff members, so feel free to check us out and see what we're all about!`;

const HELP_MESSAGE = `**🛠️ Available Commands**

**AI Commands:**
- \`${PREFIX}ask <question>\` → Ask the AI anything
- Mention the bot + message → Same as -ask

**Music Commands:**
- \`${PREFIX}play <song name or url>\` → Play a song
- \`${PREFIX}skip\` → Skip current song
- \`${PREFIX}queue\` → Show current queue
- \`${PREFIX}pause\` → Pause
- \`${PREFIX}resume\` → Resume
- \`\( {PREFIX}stop\` / \` \){PREFIX}leave\` → Stop & leave VC
- \`${PREFIX}clear\` → Clear queue

**Utility:**
- \`${PREFIX}help\` → Show this help

**Moderation:** Racist/offensive words are auto-deleted.
`;
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

// Check if user is asking about the server
function isServerInfoQuery(text) {
    const lower = text.toLowerCase();
    return /(what|tell|describe|info|about).*?(server|this server|discord|community)/i.test(lower) ||
           lower.includes("what is this server") ||
           lower.includes("what's this server");
}

// Racist Filter
function containsBannedWord(text) {
    const lower = text.toLowerCase();
    return BANNED_WORDS.some(word => lower.includes(word));
}

// Play Song
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
        player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
        players.set(guild.id, player);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            queue.shift();
            if (queue.length > 0) playSong(guild);
            else connection.destroy();
        });
    }

    player.play(resource);
}

// Main Handler
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const modChannel = message.guild?.channels.cache.get(MOD_CHANNEL_ID);

    // Racism Filter
    if (containsBannedWord(content)) {
        await message.delete().catch(() => {});
        if (modChannel) modChannel.send(`🚨 **RACIST MESSAGE** 🚨\nUser: ${message.author.tag}\nChannel: \( {message.channel}\nContent: || \){content}||`);
        return message.channel.send(`${message.author}, racist language is not allowed.`).catch(() => {});
    }

    let question = null;

    // Special Server Info Query
    if (isServerInfoQuery(content)) {
        return message.reply(SERVER_DESCRIPTION);
    }

    // Normal AI Triggers
    if (message.mentions.has(client.user)) {
        question = content.replace(`<@${client.user.id}>`, "").trim();
    } else if (content.toLowerCase().startsWith(PREFIX)) {
        const args = content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === "help") return message.reply(HELP_MESSAGE);

        if (command === "ask") {
            question = args.join(" ");
        }
    }

    if (question) {
        if (!question) return;
        await message.channel.sendTyping();
        const reply = await askAI(message.author.id, question);
        return message.reply(reply);
    }

    // Music Commands (same as before)
    const queue = queues.get(message.guild.id) || [];
    queues.set(message.guild.id, queue);

    if (content.toLowerCase().startsWith(PREFIX)) {
        const args = content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // ... (all your music commands remain the same)
        if (command === "play") {
            const search = args.join(" ");
            if (!search) return message.reply("❌ Please provide a song name or URL!");
            const voiceChannel = message.member?.voice.channel;
            if (!voiceChannel) return message.reply("❌ You must be in a voice channel!");

            try {
                const result = await play.search(search, { limit: 1 });
                const song = result[0];
                queue.push({ title: song.title, url: song.url });
                message.reply(`✅ **${song.title}** added to queue!`);
                if (queue.length === 1) playSong(message.guild);
            } catch (e) {
                message.reply("❌ Could not find that song.");
            }
        }
        // Add the rest of music commands here (skip, queue, pause, etc.) as in previous version
        else if (command === "skip" || command === "queue" || command === "pause" || 
                 command === "resume" || command === "stop" || command === "leave" || command === "clear") {
            // Reuse your previous music logic here
        }
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
