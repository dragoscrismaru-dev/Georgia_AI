require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events
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


const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates

    ],

    partials: [

        Partials.Channel,
        Partials.Message

    ]

});


const groq = new Groq({

    apiKey: process.env.GROQ_API_KEY

});


const memory = new Map();

const queues = new Map();

const players = new Map();



client.once(
    Events.ClientReady,
    () => {

        console.log(
            `✅ Logged in as ${client.user.tag}`
        );

    }
);



async function askAI(userId, message){

    if(!memory.has(userId)){

        memory.set(userId, []);

    }


    const history =
    memory.get(userId);


    history.push({

        role:"user",
        content:message

    });



    const response =
    await groq.chat.completions.create({

        model:"llama-3.3-70b-versatile",

        messages:[

            {

                role:"system",

                content:
                "You are a helpful Discord AI assistant."

            },

            ...history

        ]

    });



    const answer =
    response.choices[0].message.content;



    history.push({

        role:"assistant",
        content:answer

    });



    if(history.length > 20){

        history.splice(0,2);

    }


    return answer;

}




client.on(
Events.MessageCreate,
async message => {


    if(message.author.bot)
        return;



    const logChannel =
    message.guild?.channels.cache.get(
        process.env.LOG_CHANNEL_ID
    );


    if(logChannel){

        logChannel.send(

`📝 Message Logged

User: ${message.author.tag}

Channel: ${message.channel}

${message.content}`

        );

    }



    if(message.mentions.has(client.user)){


        const text =
        message.content
        .replace(
            `<@${client.user.id}>`,
            ""
        )
        .trim();



        if(!text)
            return;



        await message.channel.sendTyping();



        const reply =
        await askAI(
            message.author.id,
            text
        );



        message.reply(reply);

    }

});




client.on(
Events.MessageDelete,
async message => {


    const logChannel =
    message.guild?.channels.cache.get(
        process.env.LOG_CHANNEL_ID
    );


    if(logChannel){

        logChannel.send(

`❌ Deleted Message

${message.content || "No content"}`

        );

    }

});




client.on(
Events.MessageUpdate,
async (oldMessage,newMessage)=>{


    if(
        oldMessage.content ===
        newMessage.content
    )
        return;



    const logChannel =
    oldMessage.guild?.channels.cache.get(
        process.env.LOG_CHANNEL_ID
    );


    if(logChannel){

        logChannel.send(

`✏️ Edited Message

Before:
${oldMessage.content}

After:
${newMessage.content}`

        );

    }

});





async function playSong(guild,song){


    const queue =
    queues.get(guild.id);


    if(!queue || !queue.length)
        return;



    const voice =
    guild.members.me.voice.channel;


    if(!voice)
        return;



    const connection =
    joinVoiceChannel({

        channelId:voice.id,

        guildId:guild.id,

        adapterCreator:
        guild.voiceAdapterCreator

    });



    const stream =
    await play.stream(song.url);



    const resource =
    createAudioResource(
        stream.stream,
        {
            inputType:stream.type
        }
    );



    let player =
    players.get(guild.id);



    if(!player){


        player =
        createAudioPlayer({

            behaviors:{

                noSubscriber:
                NoSubscriberBehavior.Pause

            }

        });



        players.set(
            guild.id,
            player
        );



        connection.subscribe(player);



        player.on(
            AudioPlayerStatus.Idle,
            ()=>{

                queue.shift();


                if(queue.length){

                    playSong(
                        guild,
                        queue[0]
                    );

                }

            }
        );

    }



    player.play(resource);

}






client.on(
Events.InteractionCreate,
async interaction=>{


    if(!interaction.isChatInputCommand())
        return;



    if(interaction.commandName==="ask"){


        const question =
        interaction.options
        .getString("question");



        await interaction.deferReply();



        const answer =
        await askAI(
            interaction.user.id,
            question
        );



        interaction.editReply(answer);

    }


});




client.login(
process.env.DISCORD_TOKEN
);
