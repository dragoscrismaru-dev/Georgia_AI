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

const BANNED_WORDS = ["nigger","nigga","faggot","kike","chink","spic","wetback","retard","tranny","coon","jigaboo","porchmonkey", "TestN"].map(w => w.toLowerCase());
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

// Safe long message
function sendLongMessage(channel, text) {
    if (text.length <= 2000) return channel.send(text);
    const chunks = text.match(/.{1,1900}/gs) || [];
    chunks.forEach(chunk => channel.send(chunk));
}

// Server query detection
function isServerInfoQuery(text) {
    const t = text.toLowerCase();
    return /(what|tell|describe|info|about).*?(server|this server|discord|community)/i.test(t) ||
           t.includes("what is this server");
}

// AI
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

// Racist filter
function containsBannedWord(text) {
    const lower = text.toLowerCase();
    return BANNED_WORDS.some(word => lower.includes(word));
}

// Play Song
async function playSong(guild, textChannel) {
    const queue = queues.get(guild.id);
    if (!queue || queue.length === 0) return;

    const song = queue[0];
    if (textChannel) textChannel.send(`🎵 **Now Playing:** ${song.title}`);

    const voiceChannel = guild.members.me.voice.channel;
    if (!voiceChannel) return;

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

    if (containsBannedWord(content)) {
        await message.delete().catch(() => {});
        if (modChannel) modChannel.send(`🚨 Racist message from ${message.author.tag}`);
        return message.channel.send(`${message.author}, racist language not allowed.`);
    }

    if (isServerInfoQuery(content)) {
        return message.reply(SERVER_DESCRIPTION);
    }

    if (!content.startsWith(PREFIX)) return;

    const args = content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const queue = queues.get(message.guild.id) || [];
    queues.set(message.guild.id, queue);

    // Commands
    if (command === "help") {
        return message.reply("**Commands:** `-help`, `-ping`, `-server`, `-members`, `-ask`, `-play <song>`, `-skip`, `-queue`, `-pause`, `-resume`, `-stop`, `-clear`");
    }

    if (command === "ping") return message.reply(`🏓 Pong! **${Date.now() - message.createdTimestamp}ms**`);

    if (command === "server") return message.reply(SERVER_DESCRIPTION);

    if (command === "members") {
        const members = await message.guild.members.fetch();
        return message.reply(`**Total Members:** ${message.guild.memberCount}`);
    }

    if (command === "ask") {
        const question = args.join(" ");
        if (!question) return message.reply("Please ask a question!");
        await message.channel.sendTyping();
        const reply = await askAI(message.author.id, question);
        sendLongMessage(message.channel, reply);
        return;
    }

    // ==================== MUSIC COMMANDS ====================
    if (command === "play") {
        const search = args.join(" ");
        if (!search) return message.reply("❌ Please provide a song name or URL!");

        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) return message.reply("❌ You must be in a voice channel!");

        try {
            const result = await play.search(search, { limit: 1 });
            if (!result || result.length === 0) return message.reply("❌ Song not found!");

            const song = result[0];
            queue.push({ title: song.title, url: song.url });

            message.reply(`✅ **${song.title}** added to queue!`);

            if (queue.length === 1) {
                playSong(message.guild, message.channel);
            }
        } catch (e) {
            console.error(e);
            message.reply("❌ Failed to play song.");
        }
    }

    else if (command === "skip") {
        const player = players.get(message.guild.id);
        if (player) player.stop();
        message.reply("⏭️ Skipped!");
    }

    else if (command === "queue") {
        if (queue.length === 0) return message.reply("Queue is empty.");
        const list = queue.map((s, i) => `${i+1}. ${s.title}`).join("\n");
        message.reply(`**Queue:**\n${list}`);
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
        message.reply("🛑 Stopped and left voice channel.");
    }

    else if (command === "clear") {
        queues.set(message.guild.id, []);
        message.reply("🧹 Queue cleared.");
    }
});

client.login(process.env.DISCORD_TOKEN);
