/*****************
    cui.js
    スニャイヴ
    2026/05/04
*****************/

module.exports = {
    exe : execute
};

const { 
    SlashCommandBuilder, 
    SlashCommandSubcommandBuilder, 
    SlashCommandStringOption, 
    SlashCommandNumberOption, 
    SlashCommandBooleanOption 
} = require('discord.js');
const path = require('path');
const root_dir = path.join(__dirname, "../../");
const file = require('./file');

// オプションの追加
function addOptions(builder, options){
    try{
        if(!options) return;

        for(const opt of options){
            // 入力受付が文字列
            if(opt.type === "string"){
                const str_opt = new SlashCommandStringOption();
                str_opt.setName(opt.name);
                str_opt.setDescription(opt.description);
                str_opt.setAutocomplete(!!opt.autocomplete);
                str_opt.setRequired(!!opt.required);
                if(opt.max) str_opt.setMaxLength(opt.max);
                if(opt.min) str_opt.setMinLength(opt.min);
                if(opt.choices){
                    for(const choice of opt.choices){
                        str_opt.addChoices({name : choice.name, value : choice.value});
                    }
                }
                builder.addStringOption(str_opt);

            }
            
            // 入力受付が数値
            if(opt.type === "number") {
                const num_opt = new SlashCommandNumberOption()
                num_opt.setName(opt.name);
                num_opt.setDescription(opt.description);
                num_opt.setAutocomplete(!!opt.autocomplete);
                num_opt.setRequired(!!opt.required);
                if(opt.max) num_opt.setMaxValue(opt.max);
                if(opt.min) num_opt.setMinValue(opt.min);
                builder.addNumberOption(num_opt);
            }
            
            // 入力受付が真偽値
            if(opt.type === "boolean"){
                const bool_opt = new SlashCommandBooleanOption()
                bool_opt.setName(opt.name);
                bool_opt.setDescription(opt.description);
                bool_opt.setRequired(!!opt.required);
                builder.addBooleanOption(bool_opt);
            }
        }

        return;
    }catch(e){
        throw new Error(`cui.js => addOptions() \n ${e}`);
    }
}

// CUIの作成
function buildCUI(json){
    try{
        const cmds = [];

        for(const element of json){

            // フォーマット定義のスキップ
            if(element.name === "string") continue;

            const cmd = new SlashCommandBuilder();
            cmd.setName(element.name);
            cmd.setDescription(element.description);

            // コマンドオプションの追加
            if(element.subcommand && element.subcommand.length > 0){
                for(const sub_element of element.subcommand){
                    const sub_cmd = new SlashCommandSubcommandBuilder();
                    sub_cmd.setName(sub_element.name);
                    sub_cmd.setDescription(sub_element.description);
                    addOptions(sub_cmd, sub_element.option);
                    cmd.addSubcommand(sub_cmd);
                }
            }else{addOptions(cmd, element.option);}

            cmds.push(cmd);
        }

        return cmds;
    }catch(e){
        throw new Error(`cui.js => buildCUI() \n ${e}`);
    }
}

// CUI の作成
async function execute(client){
    try{
        const cui_dir = path.join(root_dir, "assets/json/cui");
        const cui_json = await file.mergeJsons(cui_dir);
        const cmds = buildCUI(cui_json);
        await client.application.commands.set(cmds);

        return;
    }catch(e){
        throw new Error(`cui.js => execute() \n ${e}`);
    }
}
        
