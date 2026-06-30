/*****************
    index.js
    スニャイヴ
    2026/06/07
*****************/

// 環境変数の読み込み
require('dotenv').config();
if(!process.env.BOT_TOKEN || !process.env.BOT_ID){
    console.error("index.js => require('dotenv').config() \n .envの読み込みに失敗しました");
    process.exit(1);
}

const {Client, GatewayIntentBits, Partials, Events} = require('discord.js');
const client = new Client({intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessageReactions], partials: [Partials.Message, Partials.Channel, Partials.Reaction]});
const map = new Map();
const activity = require('./web/activity');
const load_event = require('./loader/event');
const load_initialize = require('./loader/initialize');

// botのログイン
client.login(process.env.BOT_TOKEN);

// 起動動作
client.once(Events.ClientReady, async () => {
    try{
        // 初期化
        await load_initialize.exe(client, map);
        
        // イベントの登録
        await load_event.exe(client, map);

        // アクティビティの登録
        await activity.register(client, map);

        // botのステータス設定
        client.user.setActivity("メンションで起動できるよ！");

        console.log("### すにゃBotが起動しました ###");

        return;
    }catch(e){
        console.error("index.js => client.once() \n 起動に失敗しました \n", e);
        process.exit(1);
    }
});