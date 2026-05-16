/*****************
    vc.js
    スニャイヴ
    2026/05/05
*****************/

module.exports = {
    connect : connect,
    exe : execute
}

const {joinVoiceChannel} = require('@discordjs/voice');

const utils = require("./utils");

// ボイスチャンネルに接続
async function connect(voice_channel){
    try{
        const connect_voice_channel = joinVoiceChannel({
            channelId: voice_channel.id,
            guildId: voice_channel.guild.id,
            adapterCreator: voice_channel.guild.voiceAdapterCreator,
            selfMute: false,
            selfDeaf: true,
        });

        connect_voice_channel.on('error', (e) => {
            if(connect_voice_channel && connect_voice_channel.state.status !== 'destroyed') connect_voice_channel.destroy();
            console.error(`vc.js => connect_voice_channel.on() \n ${e}`);
        });

        return connect_voice_channel;
    }catch(e){
        throw new Error(`vc.js => connect() \n ${e}`);
    }
}

// ボイスチャンネル更新実行
async function execute(old_state, new_state, map){
    try{
        const system_id = utils.getSystemId(old_state);
        const feature_modules = map.get("feature_modules");

        for(const prefix in feature_modules){
            if(system_id.startsWith(prefix)){
                await feature_modules[prefix].voiceState(old_state, new_state, map);
                return;
            }
        }
    }catch(e){
        throw new Error(`vc.js => execute() \n ${e}`);
    }

    throw new Error(`vc.js => execute() \n not define feature.voiceState()`);
}