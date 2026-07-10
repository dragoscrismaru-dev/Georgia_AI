require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    EmbedBuilder
} = require("discord.js");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior
} = require("@discordjs/voice");

const Groq = require("groq-sdk");
const play = require("play-dl");
const ffmpeg = require("ffmpeg-static");

process.env.FFMPEG_PATH = ffmpeg;
const PREFIX = "-";
const OWNER_ID = "1408109679782924308";


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
// COMMAND LIST FOR -HELP
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
        "`-skip` - Skip song",
        "`-stop` - Stop music",
        "`-leave` - Leave voice channel"
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
// GROQ AI
// ================================

const groq = new Groq({

    apiKey: process.env.GROQ_API_KEY

});


// ================================
// STORAGE
// ================================

const memory = new Map();

const queues = new Map();

const players = new Map();

const cooldowns = new Map();


// ================================
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
// OWNER CHECK
// ================================

function isOwner(id) {

    return id === OWNER_ID;

}


// ================================
// SEND LONG MESSAGES
// DISCORD 2000 CHARACTER LIMIT
// ================================

async function sendLongMessage(channel, text) {


    const MAX_LENGTH = 2000;


    if (text.length <= MAX_LENGTH) {

        return channel.send(text);

    }



    let chunks = [];

    let current = "";



    const words = text.split(" ");



    for (const word of words) {


        if (
            (current + " " + word).length > MAX_LENGTH
        ) {


            chunks.push(current);

            current = word;


        } else {


            current +=
                (current ? " " : "") + word;


        }


    }



    if (current.length > 0) {

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


    let history = memory.get(userId) || [];



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

                    content: SERVER_DESCRIPTION

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



    memory.set(userId, history);



    return reply;


}

 // ================================
// MESSAGE HANDLER
// ================================

client.on(Events.MessageCreate, async message => {


    if (message.author.bot) return;


    const content = message.content.trim();

    const lower = content.toLowerCase();

// ============================
// MUSIC DEBUG COMMAND
// ============================

if (lower === PREFIX + "musicdebug") {

    const voice =
    message.guild.members.me.voice.channel;


    const player =
    players.get(message.guild.id);


    return message.reply(
        [
            "🎵 Music Debug",
            `Voice Channel: ${voice ? voice.name : "Not connected"}`,
            `Player: ${player ? "Created" : "No player"}`,
            `Guild ID: ${message.guild.id}`,
            `FFmpeg: ${process.env.FFMPEG_PATH ? "Loaded" : "Missing"}`
        ].join("\n")
    );

}


// ============================
// JARVIS HELP REQUEST
// ============================

if (
    lower.includes("jarvis") &&
    (
        lower.includes("help") ||
        lower.includes("commands") ||
        lower.includes("command list")
    )
) {

    const embed = new EmbedBuilder()

    .setColor("Blue")

    .setTitle("🤖 Jarvis Commands")

    .setDescription(
        `Prefix: \`${PREFIX}\`\nHere are all my commands.`
    )

    .addFields(

        {
            name: "📌 General Commands",
            value: COMMANDS.general.join("\n")
        },

        {
            name: "🎵 Music Commands",
            value: COMMANDS.music.join("\n")
        },

        {
            name: "👑 Owner Commands",
            value: COMMANDS.owner.join("\n")
        }

    )

    .setFooter({
        text: "Georgia State Roleplay • Jarvis AI"
    });


    return message.channel.send({
        embeds: [embed]
    });

}



    // ============================
    // BAD WORD FILTER
    // ============================

    if (
        BANNED_WORDS.some(word =>
            lower.includes(word)
        )
    ) {


        await message.delete()
            .catch(() => {});



        return message.channel.send({

            content:
            `${message.author}, that word is not allowed.`

        });


    }



    // ============================
    // HELP COMMAND
    // ============================

    if (lower === PREFIX + "help") {



        const embed =
        new EmbedBuilder()


        .setColor("Blue")


        .setTitle("🤖 Jarvis Commands")


        .setDescription(

            `Prefix: \`${PREFIX}\`\n` +
            "All available Jarvis commands."

        )


        .addFields(


            {

                name:
                "📌 General Commands",

                value:
                COMMANDS.general.join("\n")

            },


            {

                name:
                "🎵 Music Commands",

                value:
                COMMANDS.music.join("\n")

            },


            {

                name:
                "👑 Owner Commands",

                value:
                COMMANDS.owner.join("\n")

            }


        )


        .setFooter({

            text:
            "Georgia State Roleplay • Jarvis AI"

        });



        return message.channel.send({

            embeds:
            [embed]

        });


    }



    // ============================
    // PING
    // ============================

    if (lower === PREFIX + "ping") {


        return message.reply(

            `🏓 Pong! ${client.ws.ping}ms`

        );


    }



    // ============================
    // ABOUT
    // ============================

    if (lower === PREFIX + "about") {


        return message.reply(

            "🤖 I am Jarvis, the official AI assistant for Georgia State Roleplay."

        );


    }



    // ============================
    // SERVER INFO
    // ============================

    if (lower === PREFIX + "server") {


        return sendLongMessage(

            message.channel,

            SERVER_DESCRIPTION

        );


    }



    // ============================
    // OWNER RESTART
    // ============================

    if (lower.startsWith(
        PREFIX + "restart"
    )) {



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



    // ============================
    // OWNER SHUTDOWN
    // ============================

    if (lower.startsWith(
        PREFIX + "shutdown"
    )) {



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



    // ============================
    // OWNER SAY
    // ============================

    if (lower.startsWith(
        PREFIX + "say "
    )) {



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



        if (!question.length)
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



        } catch (error) {



            console.error(error);



            message.reply(

                "⚠️ The AI is currently unavailable."

            );



        }



    }



});// ================================
// MUSIC SYSTEM
// ================================


// PLAY COMMAND
// ================================

process.env.FFMPEG_PATH = ffmpeg;

client.on(Events.MessageCreate, async message => {


    if (message.author.bot) return;


    const args =
    message.content
    .trim()
    .split(" ");


    const command =
    args[0].toLowerCase();



    // ============================
    // PLAY
    // ============================

    if (command === PREFIX + "play") {
console.log("PLAY COMMAND USED");


        const voiceChannel =
        message.member.voice.channel;



        if (!voiceChannel) {

            return message.reply(
                "🎤 Join a voice channel first."
            );

        }



        const query =
        args.slice(1).join(" ");



        if (!query) {

            return message.reply(
                "❌ Please provide a song name."
            );

        }



        try {


            const connection =
            joinVoiceChannel({

                channelId:
                voiceChannel.id,

                guildId:
                message.guild.id,

                adapterCreator:
                message.guild.voiceAdapterCreator

            });


console.log("CREATING PLAYER");
            const player =
            createAudioPlayer({

                behaviors: {

                    noSubscriber:
                    NoSubscriberBehavior.Play

                }

            });



            players.set(

                message.guild.id,

                player

            );
console.log("PLAYER SAVED");



            const search =
            await play.search(

                query,

                {

                    limit: 1

                }

            );



            if (!search.length) {


                return message.reply(
                    "❌ Song not found."
                );


            }



            
const stream = await play.stream(search[0].url, {
    discordPlayerCompatibility: true
});



            const resource = createAudioResource(
    stream.stream,
    {
        inputType: stream.type,
        inlineVolume: true
    }
);

resource.volume.setVolume(0.5);



            player.play(resource);



            connection.subscribe(player);



            message.channel.send(

                `🎵 Now playing: **${search[0].title}**`

            );



            player.on(

                AudioPlayerStatus.Idle,

                () => {

                    connection.destroy();

                }

            );



        } catch(error) {


            console.error(error);


            message.reply(
                "⚠️ Could not play that song."
            );


        }


    }



    // ============================
    // SKIP
    // ============================

    if (command === PREFIX + "skip") {


        const player =
        players.get(
            message.guild.id
        );



        if (!player) {


            return message.reply(
                "❌ Nothing is playing."
            );


        }



        player.stop();



        return message.reply(
            "⏭️ Skipped."
        );


    }



    // ============================
    // STOP
    // ============================

    if (command === PREFIX + "stop") {


        const player =
        players.get(
            message.guild.id
        );



        if (player) {

            player.stop();

        }



        queues.delete(
            message.guild.id
        );



        return message.reply(
            "⏹️ Music stopped."
        );


    }



    // ============================
    // LEAVE
    // ============================

    if (command === PREFIX + "leave") {


        const voiceChannel =
        message.guild.members.me.voice.channel;



        if (!voiceChannel) {


            return message.reply(
                "❌ I am not in a voice channel."
            );


        }



        const connection =
        voiceChannel.guild.voiceAdapterCreator;



        const player =
        players.get(
            message.guild.id
        );



        if (player) {

            player.stop();

        }



        players.delete(
            message.guild.id
        );



        return message.reply(
            "👋 Left the voice channel."
        );


    }



});



// ================================
// LOGIN
// ================================

client.login(
    process.env.DISCORD_TOKEN
);