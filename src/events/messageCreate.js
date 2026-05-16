/***********************
    messageCreate.js
    スニャイヴ
    2026/05/05
***********************/

module.exports = {
    exe : execute
};

const cui = require('../core/cui');
const gui = require('../core/gui');
const utils = require('../core/utils');

async function execute(message, map){
    try{
        // botの発言を除外
        if(message.author.bot) return;

        // ギルド以外での動作
        if(!message.guild){
            await cui.nGuild(message, map);
            return;
        }
        
        // メンションに反応
        if(utils.isBotMention(message, map) && !message.reference){
            message.system_id = "mention";
            await cui.message(message, map);
            return;
        }

        // 名前か返信に反応
        if(utils.isBotName(message, map) || (message.reference && (await message.fetchReference())?.author.id === message.client.user.id)){
            message.system_id = "ai_chat";
            await cui.message(message, map);
            return;
        }

        // 読み上げ
        if(map.get(`read_channel_${message.channel.id}`)){
            message.system_id = "read_text";
            await cui.message(message, map);
            return;
        }

    }catch(e){
        utils.logTime(message);
        console.error("messageCreate.js => execute() \n", e);
    }
}