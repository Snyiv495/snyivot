/*****************
    error.js
    スニャイヴ
    2026/05/03
*****************/

module.exports = {
    exe : execute
};

async function execute(e, map){
    console.error("error.js => execute() \n", e);
    return;
}