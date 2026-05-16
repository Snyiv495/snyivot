/*****************
    cui.js
    スニャイヴ
    2026/05/05
*****************/

module.exports = {
    exe : execute,
    autoComplete : autoComplete,
    nGuild : nGuild,
    message : message
}

const {SlashCommandBuilder, SlashCommandStringOption, SlashCommandNumberOption, SlashCommandSubcommandBuilder, SlashCommandBooleanOption} = require("discord.js");

const gui = require("./gui");
const utils = require("./utils");

// コマンドの実行
async function execute(interaction, map){
    try{
        const system_id = utils.getSystemId(interaction);
        const feature_modules = map.get("feature_modules");

        // 機能選択
        for(const prefix in feature_modules){
            if(system_id.startsWith(prefix)){
                await feature_modules[prefix].exe(interaction, map);
                return;
            }
        }

    }catch(e){
        throw new Error(`cui.js => execute() \n ${e}`);
    }

    throw new Error("cui.js => execute() \n not define feature.exe()");
}

// コマンドの補助
async function autoComplete(interaction, map){
    try{
        const system_id = utils.getSystemId(interaction);
        const feature_modules = map.get("feature_modules");

        // 機能選択
        for(const prefix in feature_modules){
            if(system_id.startsWith(prefix)){
                await feature_modules[prefix].autoComplete(interaction, map);
                return;
            }
        }

    }catch(e){
        throw new Error(`cui.js => autoComplete() \n ${e}`);
    }

    throw new Error("cui.js => autoComplete() \n not define feature.autoComplete()");
}

// ギルド外の実行
async function nGuild(trigger, map){
    try{
        await utils.sendGUI(trigger, gui.create(map, "not_guild"));
        return;
    }catch(e){
        throw new Error(`cui.js => nGuild() \n ${e}`);
    }
}

// メッセージコマンド実行
async function message(message, map){
    try{
        const system_id = utils.getSystemId(message);
        const feature_modules = map.get("feature_modules");

        // 機能選択
        for(const prefix in feature_modules){
            if(system_id.startsWith(prefix)){
                await feature_modules[prefix].exe(message, map);
                return;
            }
        }

        // メンション
        if(system_id === "mention"){
            await mention(message, map);
            return;
        }

        // リプライ
        if(system_id === "reply"){
            await reply(message, map);
            return;
        }        
        
        return;
    }catch(e){
        throw new Error(`cui.js => message() \n ${e}`);
    }
}

// メンション
async function mention(message, map){
    try{
        await message.reply(gui.create(map, "mention"));
        return;
    }catch(e){
        throw new Error(`cui.js => mention() \n ${e}`);
    }
}

// リプライ
async function reply(message, map){
    try{
        await message.reply(utils.getArgValue(message, "reply"));
        return;
    }catch(e){
        throw new Error(`cui.js => reply() \n ${e}`);
    }
}