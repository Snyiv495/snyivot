/**************************
    voiceStateUpdate.js
    スニャイヴ
    2026/05/05
**************************/

module.exports = {
    exe : execute
};

const utils = require('../core/utils');
const vc = require('../core/vc');

async function execute(old_state, new_state, map){
    try{
        // 関与していないチャンネルを無視
        if(!map.get(`read_subscribe_${old_state?.channel?.id}`)) return;

        // ボイチャにユーザーがいなくなる
        if(!old_state.channel.members.filter((member) => !member.user.bot).size){
            old_state.system_id = "read_voice_auto_end";
            await vc.exe(old_state, new_state, map);
            return;
        }

        //ボイチャを蹴られる
        if(!old_state.channel.members.has(process.env.BOT_ID) && !new_state.channel){
            old_state.system_id = "read_voice_manual_kick";
            await vc.exe(old_state, new_state, map);
            return;
        }

        //ボイチャを移動させられる
        if(!old_state.channel.members.has(process.env.BOT_ID) && new_state.channel){
            old_state.system_id = "read_voice_manual_move";
            await vc.exe(old_state, new_state, map);
            return;
        }

    }catch(e){
        console.error("voiceStateUpdate.js => execute() \n", e);
    }
}