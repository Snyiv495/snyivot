/***************************
    interactionCreate.js
    スニャイヴ
    2026/05/05
***************************/

module.exports = {
    exe : execute
};

const cui = require('../core/cui');
const gui = require('../core/gui');
const utils = require('../core/utils');

async function execute(interaction, map){
    try{
        // ギルド以外での動作
        if(!interaction.guild){
            await cui.nGuild(interaction, map);
            return;
        }

        // スラッシュコマンド
        if(interaction.isCommand()){
            await cui.exe(interaction, map);
            return;
        }

        // スラッシュコマンド補助
        if(interaction.isAutocomplete()){
            await cui.autoComplete(interaction, map);
            return;
        }

        // セレクトメニュー
        if(interaction.isAnySelectMenu()){
            await gui.menu(interaction, map);
            return;
        }

        // ボタン
        if(interaction.isButton()){
            await gui.button(interaction, map);
            return;
        }

        // モーダル
        if(interaction.isModalSubmit()){
            await gui.modal(interaction, map);
            return;
        }

    }catch(e){
        utils.logTime(interaction);
        console.error(`interactionCreate.js => execute() \n ${e}`);
        await utils.sendGUI(interaction, gui.create(map, "error"));
        return;
    }

    // 未定義インタラクション
    utils.logTime(interaction);
    console.error("interactionCreate.js => execute() \n not define interaction");
    await utils.sendGUI(interaction, gui.create(map, "error"));
    return;
}