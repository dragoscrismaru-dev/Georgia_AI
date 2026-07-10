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

// Helper Functions
function sendLongMessage(channel, text) {
    if (text.length <= 2000) return channel.send(text);
    const chunks = text.match(/.{1,1900}/gs) || [];
    chunks.forEach(chunk => channel.send(chunk));
}

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

// ==================== MUSIC ====================
async function playSong(guild, textChannel) {
    const queue = queues.get(guild.id);
    if (!queue || queue.length === 0) return;

    const song = queue[0];
    textChannel.send(`🎵 **Now Playing:** ${song.title}`);

    // Join voice channel
    const voiceChannel = guild.members.me.voice.channel || textChannel.member.voice.channel;

    if (!voiceChannel) {
        return textChannel.send("❌ I need to be in a voice channel! Please join one and try again.");
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator
    });

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
            if (queue.length > 0) playSong(guild, textChannel);
        });
    }

    player.play(resource);
}

// Main Message Handler
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();

    // Moderation
    if (BANNED_WORDS.some(word => content.toLowerCase().includes(word))) {
        await message.delete().catch(() => {});
        return message.channel.send(`${message.author}, that word is not allowed.`);
    }

    // Server Info
    if (isServerInfoQuery(content)) {
        return message.reply(SERVER_DESCRIPTION);
    }

    if (!content.startsWith(PREFIX)) return;

    const args = content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const queue = queues.get(message.guild.id) || [];
    queues.set(message.guild.id, queue);

    // Prefix Commands
    if (command === "play") {
        const search = args.join(" ");
        if (!search) return message.reply("❌ Please provide a song name or URL!");

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply("❌ You must be in a voice channel first!");

        try {
            const result = await play.search(search, { limit: 1 });
            if (!result[0]) return message.reply("❌ Song not found!");

            queue.push({ title: result[0].title, url: result[0].url });
            message.reply(`✅ **${result[0].title}** added to queue!`);

            if (queue.length === 1) {
                playSong(message.guild, message.channel);
            }
        } catch (e) {
            console.error(e);
            message.reply("❌ Failed to find or play the song.");
        }
    } 
    else if (command === "skip") {
        const player = players.get(message.guild.id);
        if (player) player.stop();
        message.reply("⏭️ Skipped current song.");
    } 
    else if (command === "queue") {
        message.reply(queue.length ? queue.map((s,i) => `${i+1}. ${s.title}`).join("\n") : "Queue is empty.");
    } 
    else if (command === "stop") {
        const player = players.get(message.guild.id);
        if (player) player.stop();
        queues.delete(message.guild.id);
        players.delete(message.guild.id);
        message.reply("🛑 Stopped music.");
    }
    // Add more commands as needed
});

client.login(process.env.DISCORD_TOKEN);
