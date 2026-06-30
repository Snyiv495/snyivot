/*****************
    faq.js
    FAQ機能
*****************/

window.FaqFeature = {

    // faq.jsonの内容をそのまま埋め込み
    data: {
        faq: {
            title: "FAQ",
            description: "確認したい機能を選んでね",
            categories: [
                { id: "faq_ai",       label: "AI",         emoji: "🤖", desc: "AI機能について" },
                { id: "faq_omikuji",  label: "おみくじ",   emoji: "🥠", desc: "おみくじ機能について" },
                { id: "faq_reaction", label: "リアクション",emoji: "🌟", desc: "リアクション機能について" },
                { id: "faq_read",     label: "読み上げ",   emoji: "🎙️", desc: "読み上げ機能について" },
            ]
        },
        faq_ai: {
            title: "FAQ ＠ AI",
            description: "AIを呼び出して質問や機能の利用ができるよ",
            questions: [
                {
                    id: "faq_ai_q1", label: "Q1. 何ができるの？",
                    answer: "AIを呼び出して質問や機能の利用ができるよ",
                    fields: [],
                },
                {
                    id: "faq_ai_q2", label: "Q2. どうすれば質問できるの？",
                    answer: "AIを呼びながら質問を送信してね\n質問じゃない世間話にも返信するよ",
                    fields: [
                        { name: "例1", value: "すにゃbotは何ができるの？" },
                        { name: "例2", value: "おはようすにゃぼ" },
                    ],
                },
                {
                    id: "faq_ai_q3", label: "Q3. どうすれば機能を利用できるの？",
                    answer: "AIを呼びながら要望を送信してね\nAIが対応できる要望なら実行するよ",
                    fields: [
                        { name: "例1", value: "すにゃbot 読みあげを開始して" },
                        { name: "例2", value: "ねぇすにゃぼ\n辞書に「究極不思議呪文(パルプンテ)」を追加して！" },
                    ],
                },
            ]
        },
        faq_omikuji: {
            title: "FAQ ＠ おみくじ",
            description: "おみくじを引いて今日の運勢を確認できるよ",
            questions: [
                {
                    id: "faq_omikuji_q1", label: "Q1. 何ができるの？",
                    answer: "おみくじを引いて今日の運勢を確認できるよ\n今日のラッキーアイテムや夕食、クエストも教えてくれるよ",
                    fields: [],
                },
                {
                    id: "faq_omikuji_q2", label: "Q2. 何回引けるの？",
                    answer: "1日1回引けるよ\nもう引いていたら今日の結果を再表示するよ",
                    fields: [],
                },
                {
                    id: "faq_omikuji_q3", label: "Q3. どうすれば引けるの？",
                    answer: "コマンドやメニューから利用できるよ\nActivityからも引くことができるよ",
                    fields: [
                        { name: "コピペコマンド", value: "「/omikuji _draw」" },
                    ],
                },
            ]
        },
        faq_reaction: {
            title: "FAQ ＠ リアクション",
            description: "メッセージにリアクションをすることで遊べるよ",
            questions: [
                {
                    id: "faq_reaction_q1", label: "Q1. 何ができるの？",
                    answer: "メッセージにリアクションをすることで遊べるよ",
                    fields: [],
                },
                {
                    id: "faq_reaction_q2", label: "Q2. どうすれば魚拓を作れるの？",
                    answer: "魚拓を作りたいメッセージにリアクションをしてね",
                    fields: [
                        { name: "使えるリアクション一覧", value: "⬛⬜🟥🟧🟨🟩🟦🟪🟫" },
                    ],
                },
                {
                    id: "faq_reaction_q3", label: "Q3. どうすれば削除できるの？",
                    answer: "削除したい魚拓のメッセージに ✂️ リアクションをしてね",
                    fields: [],
                },
            ]
        },
        faq_read: {
            title: "FAQ ＠ 読み上げ",
            description: "文章の読み上げができるよ",
            questions: [
                {
                    id: "faq_read_q1", label: "Q1. 何ができるの？",
                    answer: "テキストチャンネルの文章をボイスチャンネルで読み上げできるよ",
                    fields: [],
                },
                {
                    id: "faq_read_q2", label: "Q2. どうすれば読み上げを始められるの？",
                    answer: "コマンドやメニュー、Activityから利用できるよ\nVCに参加してから実行してね",
                    fields: [
                        { name: "コピペコマンド", value: "「/read _start」" },
                    ],
                },
                {
                    id: "faq_read_q3", label: "Q3. どうすれば読み上げを終われるの？",
                    answer: "コマンドやメニュー、Activityから利用できるよ",
                    fields: [
                        { name: "コピペコマンド", value: "「/read _end」" },
                    ],
                },
                {
                    id: "faq_read_q4", label: "Q4. どうすれば辞書を追加できるの？",
                    answer: "コマンドやメニューから利用できるよ\nAIに実行させることもできるよ",
                    fields: [
                        { name: "コピペコマンド", value: "「/read _dict_add」" },
                        { name: "AI実行例",     value: "すにゃbot 辞書に「究極不思議呪文(パルプンテ)」を追加して" },
                    ],
                },
                {
                    id: "faq_read_q5", label: "Q5. どうすれば辞書を削除できるの？",
                    answer: "コマンドやメニューから利用できるよ\nAIに実行させることもできるよ\n未登録の単語の場合は辞書を送信するよ",
                    fields: [
                        { name: "コピペコマンド", value: "「/read _dict_del」" },
                        { name: "AI実行例",     value: "すにゃbot 辞書から「究極不思議呪文」を削除して" },
                    ],
                },
                {
                    id: "faq_read_q6", label: "Q6. どうすれば読み上げの設定ができるの？",
                    answer: "コマンドやメニューから利用できるよ\nギルド全体用のコマンドもあるから注意してね",
                    fields: [
                        { name: "ユーザー設定コマンド", value: "「/read _set_user」" },
                        { name: "サーバー設定コマンド", value: "「/read _set_guild」" },
                    ],
                },
            ]
        },
    },

    // カテゴリ選択後にQ一覧を描画
    renderCategory(categoryId) {
        const cat = this.data[categoryId];
        if (!cat) return;

        const titleEl = document.getElementById('faq-detail-title');
        const listEl  = document.getElementById('faq-question-list');
        titleEl.textContent = cat.title;
        listEl.innerHTML = '';

        cat.questions.forEach(q => {
            const row = document.createElement('div');
            row.className = 'faq-q-row';
            row.textContent = q.label;
            row.addEventListener('click', () => this.renderAnswer(categoryId, q.id));
            listEl.appendChild(row);
        });

        navigate('faq-detail');
    },

    // 回答を描画
    renderAnswer(categoryId, questionId) {
        const cat = this.data[categoryId];
        const q   = cat?.questions.find(x => x.id === questionId);
        if (!q) return;

        document.getElementById('faq-answer-title').textContent  = q.label;
        document.getElementById('faq-answer-body').textContent   = q.answer;

        const fieldsEl = document.getElementById('faq-answer-fields');
        fieldsEl.innerHTML = '';
        q.fields.forEach(f => {
            const wrap = document.createElement('div');
            wrap.className = 'faq-field';
            wrap.innerHTML = `<div class="faq-field-name">${f.name}</div><div class="faq-field-value">${f.value.replace(/\n/g, '<br>')}</div>`;
            fieldsEl.appendChild(wrap);
        });

        // 戻るボタンに categoryId を持たせる
        document.getElementById('faq-answer-back').setAttribute('data-category', categoryId);
        navigate('faq-answer');
    },
};
