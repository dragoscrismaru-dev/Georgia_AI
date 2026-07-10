require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    EmbedBuilder
} = require("discord.js");


const {
    Player
} = require("discord-player");


const {
    DefaultExtractors
} = require("@discord-player/extractor");


const Groq = require("groq-sdk");

const ffmpeg = require("ffmpeg-static");

process.env.FFMPEG_PATH = ffmpeg;


// ================================
// CONFIG
// ================================

const PREFIX = "-";

const OWNER_ID = "1408109679782924308";


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
// MUSIC PLAYER
// ================================

const player = new Player(client);

(async () => {
    await player.extractors.loadDefault();

    console.log("🎵 Music extractors loaded");
})();

// ================================
// GROQ AI
// ================================

const groq = new Groq({

    apiKey:
    process.env.GROQ_API_KEY

});


// ================================
// SERVER INFO
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
// COMMAND LIST
// ================================

const COMMANDS = {


    general: [

        "`-help` - Show commands",

        "`-ping` - Bot latency",

        "`-about` - About Jarvis",

        "`-server` - Server info"

    ],



    music: [

        "`-play <song>` - Play music",

        "`-addtoqueue <song>` - Add song",

        "`-queue` - Show queue",

        "`-skip` - Skip song",

        "`-stop` - Stop music",

        "`-leave` - Leave voice"

    ],



    owner: [

        "`-restart` - Restart bot",

        "`-shutdown` - Shutdown bot",

        "`-say <message>` - Send message"

    ]


};


// ================================
// MEMORY
// ================================

const memory = new Map();


// ================================
// OWNER CHECK
// ================================

function isOwner(id) {

    return id === OWNER_ID;

}


// ================================
// LONG MESSAGE SENDER
// ================================

async function sendLongMessage(
    channel,
    text
) {


    const limit = 2000;


    if (text.length <= limit) {

        return channel.send(text);

    }


    let chunks = [];

    let current = "";


    for (const word of text.split(" ")) {


        if (
            (current + " " + word).length
            > limit
        ) {


            chunks.push(current);

            current = word;


        } else {


            current +=
            (current ? " " : "")
            + word;


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
    completion
    .choices[0]
    .message
    .content;



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
// BOT READY
// ================================

client.once(
Events.ClientReady,
() => {


    console.log(
        "==============================="
    );

    console.log(
        "       JARVIS ONLINE"
    );

    console.log(
        "==============================="
    );


    console.log(
        `Logged in as ${client.user.tag}`
    );


    console.log(
        `Servers: ${client.guilds.cache.size}`
    );


    client.user.setPresence({

        activities: [

            {

                name:
                "Georgia State RP",

                type: 3

            }

        ],

        status:
        "online"

    });


});



// ================================
// MESSAGE HANDLER
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
            lower.includes(word)
        )

    ) {


        await message.delete()
        .catch(() => {});



        return message.channel.send(

            `${message.author}, that word is not allowed.`

        );


    }





    // ============================
    // HELP
    // ============================


    if (
        lower === PREFIX + "help"
    ) {


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

        );



        return message.channel.send({

            embeds:
            [embed]

        });


    }





    // ============================
    // PING
    // ============================


    if (
        lower === PREFIX + "ping"
    ) {


        return message.reply(

            `🏓 Pong! ${client.ws.ping}ms`

        );


    }





    // ============================
    // ABOUT
    // ============================


    if (
        lower === PREFIX + "about"
    ) {


        return message.reply(

            "🤖 I am Jarvis, the official AI assistant for Georgia State Roleplay."

        );


    }





    // ============================
    // SERVER
    // ============================


    if (
        lower === PREFIX + "server"
    ) {


        return sendLongMessage(

            message.channel,

            SERVER_DESCRIPTION

        );


    }





    // ============================
    // OWNER RESTART
    // ============================


    if (
        lower.startsWith(
            PREFIX + "restart"
        )
    ) {


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


    if (
        lower.startsWith(
            PREFIX + "shutdown"
        )
    ) {


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


    if (
        lower.startsWith(
            PREFIX + "say "
        )
    ) {


        if (!isOwner(message.author.id)) {

            return message.reply(
                "⛔ Owner only."
            );

        }



        const text =
        content.slice(5);



        await message.delete()
        .catch(() => {});



        return message.channel.send(text);


    }





    // ============================
    // JARVIS AI CHAT
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
// MUSIC COMMAND HANDLER
// ================================

client.on(
Events.MessageCreate,
async message => {


    if (message.author.bot)
        return;


    const args =
    message.content.trim()
    .split(/\s+/);


    const command =
    args[0].toLowerCase();




    // ============================
    // PLAY
    // ============================

    if (
        command === PREFIX + "play"
    ) {


        const query =
        args.slice(1).join(" ");



        if (!query) {

            return message.reply(
                "❌ Give me a song name."
            );

        }



        const voiceChannel =
        message.member.voice.channel;



        if (!voiceChannel) {

            return message.reply(
                "🎤 Join a voice channel first."
            );

        }



        try {


            const { track } =
            await player.play(

                voiceChannel,

                query,

                {

                    nodeOptions: {

                        metadata:
                        message.channel

                    }

                }

            );



            return message.channel.send(

                `🎵 Playing: **${track.title}**`

            );



        } catch(error) {


            console.error(
                "PLAY ERROR:",
                error
            );



            return message.reply(

                "⚠️ Could not play that song."

            );


        }


    }





    // ============================
    // ADD TO QUEUE
    // ============================

    if (
        command === PREFIX + "addtoqueue"
    ) {


        const query =
        args.slice(1).join(" ");



        if (!query) {

            return message.reply(
                "❌ Give me a song name."
            );

        }



        const voiceChannel =
        message.member.voice.channel;



        if (!voiceChannel) {

            return message.reply(
                "🎤 Join a voice channel first."
            );

        }



        try {


            const result =
            await player.play(

                voiceChannel,

                query,

                {

                    nodeOptions: {

                        metadata:
                        message.channel

                    }

                }

            );



            return message.channel.send(

                `➕ Added: **${result.track.title}**`

            );



        } catch(error) {


            console.error(
                error
            );


            return message.reply(

                "⚠️ Could not add that song."

            );


        }


    }





    // ============================
    // QUEUE
    // ============================

    if (
        command === PREFIX + "queue"
    ) {


        const queue =
        player.nodes.get(
            message.guild.id
        );



        if (
            !queue ||
            queue.tracks.size === 0
        ) {


            return message.reply(
                "🎵 Queue is empty."
            );


        }



        const songs =
        queue.tracks
        .toArray()
        .map(

            (track, index) =>
            `${index + 1}. ${track.title}`

        )
        .join("\n");



        return message.channel.send(

            `🎵 **Queue**\n${songs}`

        );


    }





    // ============================
    // SKIP
    // ============================

    if (
        command === PREFIX + "skip"
    ) {


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

    if (
        command === PREFIX + "stop"
    ) {


        const queue =
        player.nodes.get(
            message.guild.id
        );



        if (queue) {

            queue.delete();

        }



        return message.reply(
            "⏹️ Music stopped."
        );


    }





    // ============================
    // LEAVE
    // ============================

    if (
        command === PREFIX + "leave"
    ) {


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


});



// ================================
// LOGIN
// ================================

client.login(
    process.env.DISCORD_TOKEN
);
