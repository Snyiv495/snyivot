/*****************
    reaction.js
    スニャイヴ
    2026/05/06
*****************/

module.exports = {
    exe : execute
}

const {createCanvas, loadImage, registerFont} = require("canvas");
const twemoji = require("@twemoji/api");
const gui = require("../core/gui");
const utils = require("../core/utils");

registerFont("./assets/NotoSansJP-Regular.ttf", {family : "Noto Sans JP"});

// 文章記述
async function writeSentence(ctx, text, bubble){
    /*
        カスタム絵文字の形式
            <:custom_emoji_name:unique_number>      <= (png)
            <a:custom_emoji_name:unique_number>     <= animation(gif)
        正規表現
            /<a?:\w+:(\d+)>|(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)|([\s\S])/gu;
            カスタム絵文字 or Unicode絵文字 or 任意の1文字
        array[0] : <:xxx:000>   or Unicode絵文字    or x
        array[1] : 000          or undefind         or undefined
        array[2] : undefined    or Unicode絵文字    or undefined
        array[3] : undefined    or undefined        or x
    */
    try{
        if(!text) return;
        
        const font_size = bubble.font_size;
        const emoji_regex = /<a?:\w+:(\d+)>|(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)|([\s\S])/gu;

        let lines_info = [];
        let current_line = [];
        let current_width = 0;
        let match = null;

        //各行の作成
        ctx.font = `${font_size}px "Noto Sans JP, sans-serif"`;
        while((match = emoji_regex.exec(text)) !== null){
            let char_width = font_size;

            //普通の文字なら幅計算
            if(match[3]) char_width = ctx.measureText(match[3]).width;

            //範囲外
            if(current_width+char_width > bubble.width){
                lines_info.push({line: current_line, width: current_width});
                current_line = [];
                current_width = 0;
            }

            //文字の接続
            current_line.push(match);
            current_width += char_width;

            //改行コード
            if(match[3]==="\n"){
                lines_info.push({line: current_line, width: current_width});
                current_line = [];
                current_width = 0;
            }
        }

        //最後の行を追加
        if(current_line.length > 0){
            lines_info.push({line: current_line, width: current_width});
            current_line = [];
            current_width = 0;
        }

        //範囲外の行を削除
        if(lines_info.length*font_size > bubble.height) lines_info = lines_info.slice(0, Math.ceil(bubble.height/font_size-1));

        let current_x = bubble.x;
        let current_y = bubble.y;
        ctx.font = `${font_size}px "Noto Sans JP, sans-serif"`;
        ctx.fillStyle = bubble.fill_style;
        ctx.strokeStyle = bubble.stroke_style;

        //揃え位置の決定 y軸
        if(bubble.alignment_y === "up") current_y = bubble.y;
        if(bubble.alignment_y === "center") current_y = bubble.y + (bubble.height-lines_info.length*font_size)/2;
        if(bubble.alignment_y === "down") current_y = bubble.y + bubble.height - lines_info.length*font_size;
        
        //各行の描画
        for(const line_info of lines_info){

            //揃え位置の決定 x軸
            if(bubble.alignment_x === "left") current_x = bubble.x;
            if(bubble.alignment_x === "center") current_x = bubble.x + (bubble.width-line_info.width)/2;
            if(bubble.alignment_x === "right") current_x = bubble.x + bubble.width - line_info.width;

            for(const match of line_info.line){

                //カスタム絵文字
                if(match[1]){
                    const custom_emoji = await loadImage(`https://cdn.discordapp.com/emojis/${match[1]}.png`);
                    ctx.drawImage(custom_emoji, current_x, current_y, font_size, font_size);
                    current_x += font_size;
                }

                //Unicode絵文字
                if(match[2]){
                    const unicode_emoji_url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${twemoji.convert.toCodePoint(match[2])}.png`;
                    try {
                        const unicode_emoji = await loadImage(unicode_emoji_url);
                        ctx.drawImage(unicode_emoji, current_x, current_y, font_size, font_size);
                        current_x += font_size;
                    }catch(e){
                        // ロード失敗時は通常のテキストとして描画
                        ctx.strokeText(match[2], current_x, current_y + font_size);
                        ctx.fillText(match[2], current_x, current_y + font_size);
                        current_x += ctx.measureText(match[2]).width;
                    }
                }

                //任意の1文字
                if(match[3]){
                    const char = match[3];
                    ctx.strokeText(char, current_x, current_y+font_size);
                    ctx.fillText(char, current_x, current_y+font_size);
                    current_x += ctx.measureText(char).width;
                }
            }

            current_y += font_size;
        }

        return;
    }catch(e){
        throw new Error(`reaction.js => writeSentence() \n ${e}`);
    }
}

// キャンバス作成
async function makeCanvas(element, content, user, time){
    try{
        const canvas_info = element.canvas;
        const filter_info = element.filter;
        const content_info = element.content;
        const author_info = element.author;
        const date_info = element.date;

        const canvas_width = 1920;
        const canvas_height = 1080;
        const content_font_size = 96;
        const author_font_size = 72;
        const date_font_size = 48;
        
        //キャンバスの作成
        const canvas = createCanvas(canvas_width, canvas_height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas_width, canvas_height);

        //アイコンを描画
        const icon_x = (canvas_width*2/5-canvas_height)/2;
        const icon_y = 0;
        const icon_size = canvas_height;
        const org_icon = await loadImage(user.displayAvatarURL({extension: "png", size: 256}));
        ctx.drawImage(org_icon, icon_x, icon_y, icon_size, icon_size);
        
        //フィルター
        const ctx_icon = ctx.getImageData(icon_x, icon_y, icon_size, icon_size);
        const ctx_icon_data = ctx_icon.data;
        for(let i=0; i<ctx_icon_data.length; i+=4){
            const r = ctx_icon_data[i];
            const g = ctx_icon_data[i+1];
            const b = ctx_icon_data[i+2];
            const rgb_average = (r+g+b)/3;
            ctx_icon_data[i] = Math.min(rgb_average*filter_info.r, 255);
            ctx_icon_data[i+1] = Math.min(rgb_average*filter_info.g, 255);
            ctx_icon_data[i+2] = Math.min(rgb_average*filter_info.b, 255);
        }
        ctx.putImageData(ctx_icon, icon_x, icon_y);

        //グラデーション背景を描画
        const gradient = ctx.createRadialGradient(0, canvas_height/2, 0, 0,  canvas_height/2,  canvas_width*2/5);
        gradient.addColorStop(0, canvas_info.gra_start);
        gradient.addColorStop(1, canvas_info.gra_end);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas_width, canvas_height);

        //文字入れ
        const content_bubble = {"x": canvas_width*2/5, "y": 0, "width": canvas_width*3/5, "height": canvas_height-(author_font_size*3/2+date_font_size*3/2), "font_size": content_font_size, "alignment_x": "center", "alignment_y": "center", "fill_style": content_info.main_color, "stroke_style": content_info.sub_color};
        const author_bubble = {"x": canvas_width*2/5, "y": canvas_height-(author_font_size*3/2+date_font_size*3/2), "width": canvas_width*3/5, "height": author_font_size*3/2, "font_size": author_font_size, "alignment_x": "center", "alignment_y": "center", "fill_style": author_info.main_color, "stroke_style": author_info.sub_color};
        const date_bubble = {"x": canvas_width*2/5, "y": canvas_height-date_font_size*3/2, "width": canvas_width*3/5, "height": date_font_size*3/2, "font_size": date_font_size, "alignment_x": "right", "alignment_y": "center", "fill_style": date_info.main_color, "stroke_style": date_info.sub_color};
        await writeSentence(ctx, content, content_bubble);
        await writeSentence(ctx, `- ${user.displayName}`, author_bubble);
        await writeSentence(ctx, `${time.year}-${time.month}-${time.date}`, date_bubble);

        return canvas.toBuffer("image/png").toString("base64");
    }catch(e){
        throw new Error(`reaction.js => makeCanvas() \n ${e}`)
    }
}

// 魚拓送信
async function gyotaku(reaction, user, details, map){
    try{
        const system_id = utils.getSystemId(reaction);
        const message = reaction.message;
        const emoji = reaction.emoji.name;

        for(const element of map.get("reaction_property_json")){
            if(element.emoji === emoji){
                const gyotaku_base64 = await makeCanvas(element, message.content, utils.getUserObj(message), utils.getDate(message));
                await utils.sendGUI(message, gui.create(map, "reaction_gyotaku",
                    {
                        "{{__GYOTAKU_NAME__}}" : element.name,
                        "{{__GYOTAKU_BASE64__}}" : gyotaku_base64,
                        "{{__REACT_USER_NAME__}}" : user.displayName,
                        "{{__REACT_USER_ICON__}}" : user.displayAvatarURL()
                    }
                ));
                return;
            }
        }
    }catch(e){
        throw new Error(`reaction.js => gyotaku() \n ${e}`);
    }

    throw new Error(`reaction.js => gyotaku() \n not define emoji : ${reaction.emoji.name}`);
}

// 削除
async function remove(reaction, user, details, map){
    const message = reaction.message;

    // botのメッセージを削除
    if(message.author.id === message.client.user.id){
        await message.delete().catch(() => null);
        return;
    }

    // botのリアクションを削除
    if(message.author.id != message.client.user.id){
        await message.reactions.cache.filter(react => react.me).map(react => react.users.remove(message.client.user.id).catch(() => null));
        return;
    }
}

// 実行
async function execute(reaction, user, details, map){
    try{
        const system_id = utils.getSystemId(reaction);

        // 魚拓
        if(system_id === "reaction_gyotaku"){
            await gyotaku(reaction, user, details, map);
            return;
        }

        // 削除
        if(system_id === "reaction_remove"){
            await remove(reaction, user, details, map);
            return;
        }

        // 引数が他のexecuteと違うため無理やり合わせてます
        await utils.sendGUI(reaction, gui.create(user, system_id));

        return;
    }catch(e){
        throw new Error(`reaction.js => execute() \n ${e}`);
    }
}