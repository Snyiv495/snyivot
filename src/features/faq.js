/*****************
    faq.js
    スニャイヴ
    2026/05/06
*****************/

module.exports = {
    exe: execute,
}

const gui = require("../core/gui");
const utils = require("../core/utils");

//FAQの実行
async function execute(trigger, map){
    try{
        const system_id = utils.getSystemId(trigger);
        const bot_id = process.env.BOT_ID;
        if(!bot_id) throw new Error(`faq.js => execute () \n not define .env : BOT_ID`);

        //延期の送信
        if(utils.isInteraction(trigger) && !system_id.includes("modal")){
            await utils.sendDefer(trigger);
        }

        await utils.sendGUI(trigger, gui.create(map, system_id,
            {
                "{{__BOT_ID__}}" : `<@${bot_id}>`
            }
        ));
        return;
    }catch(e){
        throw new Error(`faq.js => execute() \n ${e}`);
    }
}