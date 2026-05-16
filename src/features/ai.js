/*****************
    ai.js
    スニャイヴ
    2026/05/06
*****************/

module.exports = {
    exe : execute
}

const cui = require('../core/cui');
const gui = require('../core/gui');
const utils = require('../core/utils');
const gemini = require('../integrations/gemini');

//公開チャット
async function chat(message, map){
    try{
        const system_id = utils.getSystemId(message);
        const date = utils.getDate(message);
        const time = utils.getTime(message);
        const ai_property_json = map.get("ai_property_json");
        const reference = message.reference ? (await message.fetchReference()).cleanContent : "null";
        const messages = [...(await message.channel.messages.fetch({limit: 21})).values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const message_log = JSON.stringify(messages.slice(0, -1).map(message => (
            {
                username : message.author.displayName,
                content : message.content,
                timestamp : message.createdAt.toISOString()
            }
        )));
        const replacement = {
            "{{__TIME__}}" : `${date.year}/${date.month}/${date.date}(${date.day}) ${time.hours}:${time.minutes}:${time.seconds}.${time.milliseconds}`,
            "{{__USER_NAME__}}" : utils.getUserName(message),
            "{{__MESSAGE_LOG__}}": message_log,
            "{{__REFERENCE__}}" : reference,
            "{{__README__}}" : map.get("readme_md")
        }

        // プロンプトの取得
        for(const element of ai_property_json){
            if(element.id === system_id && element.support === "prompt"){
                const role = element.role.join("\n");
                const style = element.style.join("\n");
                const infomation = utils.replace(element.infomation.join("\n"), replacement);
                const function_call = (await gemini.exeFunction(message.content, `${role}\n${style}\n${infomation}`, map)).functionCalls?.[0];

                message.system_id = function_call?.name ?? "reply";
                message.args = function_call?.args ?? {"reply" : null};

                await cui.message(message, map);

                return;
            }
        }

        throw new Error(`ai.js => chat() \n not define prompt id : ${system_id}`);
    }catch(e){
        throw new Error(`ai.js => chat() \n ${e}`);
    }
}

//AIコマンド実行
async function execute(trigger, map){
    try{
        const system_id = utils.getSystemId(trigger);

        //延期の送信
        if(utils.isInteraction(trigger) && !system_id.includes("modal")){
            await utils.sendDefer(trigger);
        }

        //チャットコマンド
        if(system_id === "ai_chat"){
            await chat(trigger, map);
            return;
        }

        //GUI送信
        await utils.sendGUI(trigger, gui.create(map, system_id));

        return;

    }catch(e){
        throw new Error(`ai.js => execute() \n ${e}`);
    }
}