require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    EmbedBuilder
} = require("discord.js");

const Groq = require("groq-sdk");

const ffmpeg = require("ffmpeg-static");

const {
    Player
} = require("discord-player");

const {
    DefaultExtractors
} = require("@discord-player/extractor");


// ================================
// FFMPEG
// ================================

process.env.FFMPEG_PATH = ffmpeg;


// ================================
// CONFIG
// ================================

const PREFIX = "-";

const OWNER_ID = "1408109679782924308";


// ================================
// FILTER
// ================================

const BANNED_WORDS = [

    "nigger",
    "nigga",
    "faggot",
    "kike",
    "chink",
    "spic",
    "wetback",
    "retard",
    "tranny",
    "coon"

].map(word => word.toLowerCase());


// ================================
// SERVER AI INFO
// ================================

const SERVER_DESCRIPTION = `
Georgia State Roleplay Discord Server.

Jarvis is the official AI assistant.

Jarvis helps members with:
- Roleplay questions
- Server information
- Commands
- Moderation assistance
- General questions

Always be helpful and professional.
`;


// ================================
// COMMAND LIST
// ================================

const COMMANDS = {

    general: [

        "`-help` - Shows all commands",
        "`-ping` - Shows bot latency",
        "`-about` - About Jarvis",
        "`-server` - Server information"

    ],


    music: [

        "`-play <song>` - Play music",
        "`-addtoqueue <song>` - Add song to queue",
        "`-queue` - Show queue",
        "`-skip` - Skip song",
        "`-stop` - Stop music",
        "`-leave` - Leave voice channel",
        "`-musicdebug` - Music diagnostics"

    ],


    owner: [

        "`-restart` - Restart Jarvis",
        "`-shutdown` - Shutdown Jarvis",
        "`-say <message>` - Send a message"

    ]

};


// ================================
// DISCORD CLIENT
// ================================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMessages,

        GatewayIntentBits.MessageContent,

        GatewayIntentBits.GuildVoiceStates,

        GatewayIntentBits.GuildMembers

    ],

    partials: [

        Partials.Channel,

        Partials.Message

    ]

});


// ================================
// DISCORD PLAYER
// ================================

const player = new Player(client);


(async () => {

    await player.extractors.load(
        DefaultExtractors
    );

})();


// ================================
// GROQ
// ================================

const groq = new Groq({

    apiKey: process.env.GROQ_API_KEY

});


// ================================
// STORAGE
// ================================

const memory = new Map();

const queues = new Map();


// ================================
// OWNER CHECK
// ================================

function isOwner(id) {

    return id === OWNER_ID;

}// ================================
// BOT READY
// ================================

client.once(Events.ClientReady, () => {

    console.clear();

    console.log("===============================");
    console.log("       JARVIS ONLINE");
    console.log("===============================");

    console.log(
        `Logged in as ${client.user.tag}`
    );

    console.log(
        `Servers: ${client.guilds.cache.size}`
    );

    console.log("===============================");


    client.user.setPresence({

        activities: [

            {
                name: "Georgia State RP",
                type: 3
            }

        ],

        status: "online"

    });

});


// ================================
// SEND LONG MESSAGE
// DISCORD 2000 LIMIT
// ================================

async function sendLongMessage(channel, text) {

    const limit = 2000;


    if (text.length <= limit) {

        return channel.send(text);

    }


    let chunks = [];

    let current = "";


    for (const word of text.split(" ")) {


        if (
            (current + " " + word).length > limit
        ) {

            chunks.push(current);

            current = word;


        } else {


            current +=
            (current ? " " : "") + word;

        }

    }


    if (current) {

        chunks.push(current);

    }


    for (const chunk of chunks) {

        await channel.send(chunk);

    }

}


// ================================
// AI FUNCTION
// ================================

async function askAI(userId, prompt) {


    let history =
    memory.get(userId) || [];


    history.push({

        role: "user",

        content: prompt

    });


    const completion =
    await groq.chat.completions.create({

        model:
        "llama-3.3-70b-versatile",


        messages: [

            {

                role: "system",

                content:
                SERVER_DESCRIPTION

            },

            ...history

        ]

    });


    const reply =
    completion.choices[0]
    .message.content;


    history.push({

        role: "assistant",

        content: reply

    });


    if (history.length > 20) {

        history =
        history.slice(-20);

    }


    memory.set(
        userId,
        history
    );


    return reply;

}


// ================================
// AI + COMMAND HANDLER
// ================================

client.on(
Events.MessageCreate,
async message => {


    if (message.author.bot)
        return;


    const content =
    message.content.trim();


    const lower =
    content.toLowerCase();



    // ============================
    // WORD FILTER
    // ============================

    if (
        BANNED_WORDS.some(word =>
        lower.includes(word))
    ) {


        await message.delete()
        .catch(() => {});


        return message.reply(
            "That word is not allowed."
        );

    }



    // ============================
    // HELP COMMAND
    // ============================

    if (lower === PREFIX + "help") {


        const embed =
        new EmbedBuilder()

        .setColor("Blue")

        .setTitle(
            "🤖 Jarvis Commands"
        )

        .setDescription(
            `Prefix: \`${PREFIX}\``
        )

        .addFields(

            {
                name:
                "📌 General",

                value:
                COMMANDS.general.join("\n")
            },


            {
                name:
                "🎵 Music",

                value:
                COMMANDS.music.join("\n")
            },


            {
                name:
                "👑 Owner",

                value:
                COMMANDS.owner.join("\n")
            }

        )


        .setFooter({

            text:
            "Georgia State Roleplay • Jarvis"

        });


        return message.channel.send({

            embeds:
            [embed]

        });

    }



    // ============================
    // JARVIS COMMAND REQUEST
    // ============================

    if (

        lower.includes("jarvis")

        &&

        (

            lower.includes("help")

            ||

            lower.includes("commands")

            ||

            lower.includes("command list")

        )

    ) {


        return message.channel.send({

            embeds:[

                new EmbedBuilder()

                .setColor("Blue")

                .setTitle(
                    "🤖 Jarvis Commands"
                )

                .setDescription(
                    `Use \`${PREFIX}help\` to see commands.`
                )

            ]

        });

    }



    // ============================
    // BASIC COMMANDS
    // ============================

    if (lower === PREFIX + "ping") {

        return message.reply(
            `🏓 Pong! ${client.ws.ping}ms`
        );

    }



    if (lower === PREFIX + "about") {

        return message.reply(
            "🤖 I am Jarvis, the official AI assistant for Georgia State Roleplay."
        );

    }



    if (lower === PREFIX + "server") {

        return sendLongMessage(
            message.channel,
            SERVER_DESCRIPTION
        );

    }// ================================
// OWNER COMMANDS
// ================================

    if (lower.startsWith(PREFIX + "restart")) {

        if (!isOwner(message.author.id)) {

            return message.reply(
                "⛔ Owner only."
            );

        }


        await message.reply(
            "🔄 Restarting Jarvis..."
        );


        process.exit(0);

    }



    if (lower.startsWith(PREFIX + "shutdown")) {

        if (!isOwner(message.author.id)) {

            return message.reply(
                "⛔ Owner only."
            );

        }


        await message.reply(
            "🛑 Shutting down Jarvis."
        );


        process.exit(0);

    }



    if (lower.startsWith(PREFIX + "say ")) {


        if (!isOwner(message.author.id)) {

            return message.reply(
                "⛔ Owner only."
            );

        }


        const msg =
        content.slice(5);


        await message.delete()
        .catch(() => {});


        return message.channel.send(msg);

    }



    // ============================
    // JARVIS AI
    // ============================

    if (

        lower.includes("jarvis")

        ||

        message.mentions.has(client.user)

    ) {


        const question =
        content

        .replace(/jarvis/gi, "")

        .replace(
            /<@!?[0-9]+>/g,
            ""
        )

        .trim();


        if (!question)
            return;


        await message.channel.sendTyping();


        try {


            const reply =
            await askAI(
                message.author.id,
                question
            );


            await sendLongMessage(
                message.channel,
                reply
            );


        } catch(error) {


            console.error(error);


            message.reply(
                "⚠️ AI unavailable."
            );


        }

    }


});


// ================================
// MUSIC SYSTEM
// ================================

client.on(
Events.MessageCreate,
async message => {


    if (message.author.bot)
        return;


    const args =
    message.content.trim()
    .split(" ");


    const command =
    args[0].toLowerCase();



    // ============================
    // PLAY
    // ============================

    if (command === PREFIX + "play") {


        const voice =
        message.member.voice.channel;


        if (!voice) {

            return message.reply(
                "🎤 Join a voice channel first."
            );

        }


        const query =
        args.slice(1).join(" ");


        if (!query) {

            return message.reply(
                "❌ Give me a song name."
            );

        }


        try {


            const { track } =
            await player.play(

                voice,

                query,

                {

                    nodeOptions: {

                        metadata:
                        message.channel

                    }

                }

            );


            message.channel.send(
                `🎵 Now playing: **${track.title}**`
            );


        } catch(error) {


            console.error(
                "MUSIC ERROR:",
                error
            );


            message.reply(
                "⚠️ Could not play that song."
            );

        }

    }



    // ============================
    // QUEUE
    // ============================

    if (command === PREFIX + "queue") {


        const queue =
        player.nodes.get(
            message.guild.id
        );


        if (!queue) {

            return message.reply(
                "🎵 Queue is empty."
            );

        }


        const tracks =
        queue.tracks
        .toArray()
        .map(
            (song, i) =>
            `${i + 1}. ${song.title}`
        )
        .join("\n");


        return message.channel.send(
            `🎵 **Queue**\n${tracks}`
        );

    }



    // ============================
    // SKIP
    // ============================

    if (command === PREFIX + "skip") {


        const queue =
        player.nodes.get(
            message.guild.id
        );


        if (!queue) {

            return message.reply(
                "❌ Nothing playing."
            );

        }


        queue.node.skip();


        return message.reply(
            "⏭️ Skipped."
        );

    }



    // ============================
    // STOP
    // ============================

    if (command === PREFIX + "stop") {


        const queue =
        player.nodes.get(
            message.guild.id
        );


        if (queue) {

            queue.delete();

        }


        return message.reply(
            "⏹️ Stopped."
        );

    }



    // ============================
    // LEAVE
    // ============================

    if (command === PREFIX + "leave") {


        const queue =
        player.nodes.get(
            message.guild.id
        );


        if (queue) {

            queue.delete();

        }


        return message.reply(
            "👋 Left voice channel."
        );

    }



    // ============================
    // MUSIC DEBUG
    // ============================

    if (command === PREFIX + "musicdebug") {


        const voice =
        message.guild.members.me.voice.channel;


        const queue =
        player.nodes.get(
            message.guild.id
        );


        return message.reply(

            [
                "🎵 Music Debug",

                `Voice Channel: ${
                    voice
                    ? voice.name
                    : "Not connected"
                }`,

                `Player: ${
                    queue
                    ? "Created"
                    : "No player"
                }`,

                `Guild ID: ${
                    message.guild.id
                }`,

                `FFmpeg: Loaded`

            ].join("\n")

        );

    }


});


// ================================
// LOGIN
// ================================

client.login(process.env.DISCORD_TOKEN);