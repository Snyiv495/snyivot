/******************
    gemini.js
    スニャイヴ
    2026/05/06
******************/

module.exports = {
    exe: execute,
    exeFunction: exeFunction,
    exeJson: exeJson
}

const {GoogleGenAI} = require('@google/genai');
const gemini = new GoogleGenAI({apiKey : process.env.GEMINI_APIKEY});

// 応答作成
async function execute(text, instruction, map){
    try{
        const gemini_res = await gemini.models.generateContent(
            {
                model : "gemini-3.1-flash-lite-preview",
                contents : [
                    {
                        role : "user",
                        parts : [{text : text}]
                    }
                ],
                config : {
                    systemInstruction : instruction,
                    maxOutputTokens : 1000
                },
            }
        );

        return gemini_res; 
    }catch(e){
        throw new Error(`gemini.js => execute() \n ${e}`);
    }
}

// 関数呼び出し付き応答作成
async function exeFunction(text, instruction, map){
    try{
        // 関数の取得
        const ai_property_json = map.get("ai_property_json");
        const functions = [];
        for(const element of ai_property_json){
            if(element.support === "function"){
                functions.push(element);
            }
        }

        const gemini_res = await gemini.models.generateContent(
            {
                model : "gemini-3.1-flash-lite-preview",
                contents : [
                    {
                        role : "user",
                        parts : [{text : text}]
                    }
                ],
                config : {
                    tools : [{functionDeclarations : functions}],
                    toolConfig : {functionCallingConfig : {mode : "any"}},
                    systemInstruction : instruction,
                    maxOutputTokens : 1000
                },
            }
        );

        return gemini_res;
    }catch(e){
        throw new Error(`gemini.js => exeFunction() \n ${e}`);
    }
}

// JSON制約付き応答作成
async function exeJson(text, schema, map){
    try{
        const gemini_res = await gemini.models.generateContent(
            {
                model : "gemini-3.1-flash-lite-preview",
                contents : [
                    {
                        role : "user",
                        parts : [{text : text}]
                    }
                ],
                config : {
                    responseMimeType : "application/json",
                    responseSchema : schema,
                    temperature : 0.9,
                    maxOutputTokens : 1000
                },
            }
        );

        return gemini_res;
    }catch(e){
        throw new Error(`gemini.js => exeJson() \n ${e}`);
    }
}