/*****************
    gui.js
    スニャイヴ
    2026/05/05
*****************/

module.exports = {
    create : create,
    menu : menu,
    button : button,
    modal : modal,
    reaction : reaction
}

const {EmbedBuilder, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags} = require("discord.js");
const path = require("path");
const root_dir = path.join(__dirname, "../../");
const utils = require("./utils");

//埋め込みの取得
function getEmbeds(gui, replacement){
    const embeds = [];

    if(gui.embeds.length){
        const embed = new EmbedBuilder();
        const gui_embed = gui.embeds[0];

        embed.setTitle(utils.replace(gui_embed.title, replacement));
        embed.setURL(utils.replace(gui_embed.url, replacement));
        embed.setDescription(utils.replace(gui_embed.description, replacement));
        embed.setImage(utils.replace(gui_embed.image, replacement));
        embed.setColor(utils.replace(gui_embed.color, replacement));
        embed.setFooter({text: utils.replace(gui_embed.footer.text, replacement), iconURL: utils.replace(gui_embed.footer.url, replacement)});
        embed.setThumbnail(`attachment://${utils.replace(gui_embed.thumbnail?.name, replacement) ?? "thumbnail.png"}`);

        for(const field of Object.values(gui_embed.fields??{})){
            embed.addFields(
                {
                    name: utils.replace(field.name, replacement),
                    value: utils.replace(field.value, replacement),
                    inline: field.inline ?? false
                }
            );
        }

        embeds.push(embed);
    }

    return embeds;
}

//ファイルの取得
function getFiles(gui, map, replacement){
    const files = [];
    const image_dir = path.join(root_dir, "assets/image");
    const default_path = path.join(root_dir, "assets/image/default.png").replace(/\\/g, "/");

    if(gui.embeds.length){
        const attachment = new AttachmentBuilder();
        const file_name = utils.replace(gui.embeds[0].thumbnail?.name, replacement);
        const file_path = utils.replace(gui.embeds[0].thumbnail?.path, replacement);
        const file_base64 = utils.replace(gui.embeds[0].thumbnail?.base64, replacement);

        attachment.setName(file_name ?? "thumbnail.png");
        if(file_path) attachment.setFile(map.get(path.join(image_dir, file_path).replace(/\\/g, "/")) ?? map.get(default_path));
        if(file_base64) attachment.setFile(Buffer.from(file_base64, "base64"));
        if(attachment.attachment) files.push(attachment);
    }

    if(gui.files.length){
        for(const file of Object.values(gui.files)){
            const attachment = new AttachmentBuilder();
            const file_name = utils.replace(file?.name, replacement);
            const file_path = utils.replace(file?.path, replacement);
            const file_base64 = utils.replace(file?.base64, replacement);

            attachment.setName(file_name ?? "image.png");
            if(file_path) attachment.setFile(map.get(path.join(image_dir, file_path).replace(/\\/g, "/")) ?? map.get(default_path));
            if(file_base64) attachment.setFile(Buffer.from(file_base64, "base64"));
            if(attachment.attachment) files.push(attachment);
        }
    }
    
    return files;
}

//メニューの取得
function getMenus(gui, replacement){
    const component = [];

    if(gui.menus.length){
        const menus = new ActionRowBuilder();
        const menu = new StringSelectMenuBuilder();
        const gui_menu = gui.menus[0];

        menu.setCustomId(utils.replace(gui_menu.id, replacement) ?? "null");
        menu.setPlaceholder(utils.replace(gui_menu.placeholder, replacement) ?? "null");
        menu.setDisabled(gui_menu.disabled ?? false);

        if(!gui_menu.options.length){
            const option = new StringSelectMenuOptionBuilder();
            option.setLabel("null");
            option.setValue("null");
            option.setDescription("null");
            option.setEmoji("🆖");
            menu.addOptions(option);
        }

        for(const opt of Object.values(gui_menu.options)){
            const option = new StringSelectMenuOptionBuilder();
            option.setLabel(utils.replace(opt.label, replacement) ?? "null");
            option.setValue(utils.replace(opt.value, replacement) ?? "null");
            option.setDescription(utils.replace(opt.description, replacement) ?? "null");
            option.setEmoji(utils.replace(opt.emoji, replacement) ?? "🆖");
            menu.addOptions(option);
        }

        menus.addComponents(menu);
        component.push(menus);
    }

    return component;
}

//ボタンの取得
function getButtons(gui, replacement){
    const component = [];

    if(gui.buttons.length){
        const buttons = new ActionRowBuilder();

        for(const gui_button of Object.values(gui.buttons)){
            const button = new ButtonBuilder();
            button.setLabel(utils.replace(gui_button.label, replacement) ?? "null");
            button.setCustomId(utils.replace(gui_button.id, replacement) ?? "null");
            button.setEmoji(utils.replace(gui_button.emoji, replacement) ?? "🆖");
            button.setDisabled(gui_button.disabled ?? false);
            switch(utils.replace(gui_button.style, replacement) ?? "Primary"){
                case "Primary" : button.setStyle(ButtonStyle.Primary); break;
                case "Secondary" : button.setStyle(ButtonStyle.Secondary); break;
                case "Success" : button.setStyle(ButtonStyle.Success); break;
                case "Danger" : button.setStyle(ButtonStyle.Danger); break;
                case "Link" : button.setStyle(ButtonStyle.Link); break;
                default : button.setStyle(ButtonStyle.Primary); break;
            }

            buttons.addComponents(button);
        }

        component.push(buttons)
    }

    return component;
}

//モーダルの取得
function getModal(gui, replacement){
    if(gui.modals.length){
        const modal = new ModalBuilder();
        const gui_modal = gui.modals[0];

        modal.setTitle(utils.replace(gui_modal.title, replacement) ?? "null");
        modal.setCustomId(utils.replace(gui_modal.id, replacement) ?? "null");

        if(!gui_modal.inputs.length){
            const text_input = new TextInputBuilder();

            text_input.setLabel("null");
            text_input.setCustomId("null");
            text_input.setPlaceholder("null");
            text_input.setMaxLength(2);
            text_input.setMinLength(1);
            text_input.setRequired(false);
            text_input.setStyle(TextInputStyle.Short)
            modal.addComponents(new ActionRowBuilder().addComponents(text_input));
        }

        for(const input of Object.values(gui_modal.inputs)){
            const text_input = new TextInputBuilder();

            text_input.setLabel(utils.replace(input.label, replacement) ?? "null");
            text_input.setCustomId(utils.replace(input.id, replacement) ?? "null");
            text_input.setPlaceholder(utils.replace(input.placeholder, replacement) ?? "null");
            text_input.setMaxLength(input.max ?? 5);
            text_input.setMinLength(input.min ?? 1);
            text_input.setRequired(input.required ?? false);
            switch(utils.replace(input.style, replacement) ?? "Short"){
                case "Short" : text_input.setStyle(TextInputStyle.Short); break;
                case "Paragraph" : text_input.setStyle(TextInputStyle.Paragraph); break;
                default : text_input.setStyle(TextInputStyle.Short); break;
            }
            modal.addComponents(new ActionRowBuilder().addComponents(text_input));
        }

        return modal;
    }

    return null;
}

//GUIの作成
function create(map, system_id, replacement={}){
    try{
        const gui_json = map.get("gui_json");
        const match_gui = gui_json.find(gui => gui.id === system_id);
        if(!match_gui) throw new Error(`not define system id : ${system_id}`);

        const content = utils.replace(match_gui.content, replacement);
        const files = getFiles(match_gui, map, replacement);
        const embeds = getEmbeds(match_gui, replacement);
        const menus = getMenus(match_gui, replacement);
        const buttons = getButtons(match_gui, replacement);
        const components = menus.concat(buttons);
        const modal = getModal(match_gui, replacement);

        return modal ?? {content : content, files : files, embeds : embeds, components : components, flags : MessageFlags.Ephemeral};
    }catch(e){
        throw new Error(`gui.js => create() \n ${e}`);
    }
}

//メニューの実行
async function menu(interaction, map){
    try{
        // 機能実行
        const system_id = utils.getSystemId(interaction);
        const feature_modules = map.get("feature_modules");

        if(!system_id) throw new Error(`not define system id : ${system_id}`);

        for(const prefix in feature_modules){
            if(system_id.startsWith(prefix)){
                await feature_modules[prefix].exe(interaction, map);
                return;
            }
        }

        //GUIの送信
        await utils.sendGUI(interaction, create(map, system_id));

        return;
    }catch(e){
        throw new Error(`gui.js => menu() \n ${e}`);
    }
}

//ボタンの実行
async function button(interaction, map){
    try{
        // 機能実行
        const system_id = utils.getSystemId(interaction);
        const feature_modules = map.get("feature_modules");

        if(!system_id) throw new Error(`not define system id : ${system_id}`);

        for(const prefix in feature_modules){
            if(system_id.startsWith(prefix)){
                await feature_modules[prefix].exe(interaction, map);
                return;
            }
        }

        //GUIの送信
        await utils.sendGUI(interaction, create(map, system_id));

        return;
    }catch(e){
        throw new Error(`gui.js => button() \n ${e}`);
    }
}

//モーダルの実行
async function modal(interaction, map){
    try{
        // 機能実行
        const system_id = utils.getSystemId(interaction);
        const feature_modules = map.get("feature_modules");

        if(!system_id) throw new Error(`not define system id : ${system_id}`);

        for(const prefix in feature_modules){
            if(system_id.startsWith(prefix)){
                await feature_modules[prefix].exe(interaction, map);
                return;
            }
        }

    }catch(e){
        throw new Error(`gui.js => modal() \n ${e}`);
    }
    
    throw new Error("gui.js => modal() \n not define feature.exe()");
}

//リアクションの実行
async function reaction(reaction, user, details, map){
    try{
        // 機能実行
        const system_id = utils.getSystemId(reaction);
        const feature_modules = map.get("feature_modules");

        if(!system_id) throw new Error(`not define system id : ${system_id}`);

        for(const prefix in feature_modules){
            if(system_id.startsWith(prefix)){
                await feature_modules[prefix].exe(reaction, user, details, map);
                return;
            }
        }
        
        return;
    }catch(e){
        throw new Error(`gui.js => reaction() \n ${e}`);
    }
}