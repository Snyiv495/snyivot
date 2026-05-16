/****************************
    messageReactionAdd.js
    スニャイヴ
    2026/05/05
****************************/

module.exports = {
    exe : execute
};

const gui = require('../core/gui');

async function execute(reaction, user, details, map){
    try{
        // データの補完
        if(reaction.partial) await reaction.fetch();
        if(user.partial) await user.fetch();

        // リアクション確認
        if(user.bot || reaction.count > 1) return;
        for(const element of map.get("reaction_property_json")){
            if(element.emoji === reaction.emoji.name){
                // スパム防止リアクション付与
                if(element.spam) reaction.message.react(reaction.emoji).catch(() => null);
                reaction.system_id = element.system_id;
                await gui.reaction(reaction, user, details, map);
                return;
            }
        }
    }catch(e){
        console.error("messageReactionAdd.js => execute() \n", e);
    }
}