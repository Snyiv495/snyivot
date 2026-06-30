/*****************
    omikuji.js
    おみくじ機能
*****************/

window.OmikujiFeature = {

    async draw() {
        const { userId } = window.App ?? {};
        if (!userId) { showToast('認証が完了していません', 'error'); return; }

        // アニメーション画面へ
        navigate('omikuji-drawing');

        try {
            const res  = await fetch('/api/omikuji', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            this.showResult(data.result, data.cached);
        } catch (e) {
            navigate('omikuji');
            showToast('おみくじに失敗しました: ' + e.message, 'error');
        }
    },

    showResult(result, cached) {
        // 結果を各要素にセット
        document.getElementById('omikuji-fortune').textContent      = result.fortune      ?? '？';
        document.getElementById('omikuji-speaker').textContent      = result.speaker_name ?? '？';
        document.getElementById('omikuji-item').textContent         = result.item         ?? '？';
        document.getElementById('omikuji-dinner').textContent       = result.dinner       ?? '？';
        document.getElementById('omikuji-quest').textContent        = result.quest        ?? '？';
        document.getElementById('omikuji-advice').textContent       = result.advice       ?? '？';
        document.getElementById('omikuji-date').textContent         = result.date         ?? '';

        // ラッキーカラー
        const hex = (result.color ?? '8b5cf6').replace(/^#/, '');
        document.getElementById('omikuji-color-code').textContent   = '#' + hex.toUpperCase();
        document.getElementById('omikuji-color-swatch').style.background = '#' + hex;

        // 再表示バナー（カード外）
        document.getElementById('omikuji-cached-note').style.display = cached ? 'flex' : 'none';

        // 運勢によって色を変える
        const fortuneEl = document.getElementById('omikuji-fortune');
        const colorMap  = {
            'TOP 1% USER !!!':   '#ffd700',
            '大吉':              '#ff6b6b',
            '中吉':              '#f59e0b',
            '小吉':              '#34d399',
            '末吉':              '#60a5fa',
            '吉':                '#a78bfa',
            '凶':                '#9ca3af',
            '大凶':              '#6b7280',
            'BOTTOM 1% USER...': '#4b5563',
        };
        fortuneEl.style.color = colorMap[result.fortune] ?? '#f0eeff';

        // アクセントカラー（カード上部ラインに反映）
        document.getElementById('omikuji-result-card').style.setProperty('--omikuji-color', '#' + hex);

        navigate('omikuji-result');
    },
};
