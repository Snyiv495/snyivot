/*****************
    main.js
    起動・イベント登録
*****************/

window.App = { userId: null, guildId: null, channelId: null };

// ---- グローバルユーティリティ ----

function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = '<div class="tdot"></div>' + msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3200);
}

// ヘッダーレス化により不要だが互換性のため残置
function setStatus(state, label) {}

function setSliderVal(sliderId, valId, value, divisor) {
    document.getElementById(sliderId).value = Math.round(value * divisor);
    document.getElementById(valId).textContent = value.toFixed(2);
}

async function withBtn(btnId, label, fn) {
    const btn = document.getElementById(btnId);
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = orig; }
}

// ---- タブ ----

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            btn.closest('.tab-bar').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            btn.closest('.screen').querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.closest('.screen').querySelector('#tab-' + tabId)?.classList.add('active');
        });
    });
}

// ---- スライダー ----

function initSliders() {
    [
        ['pitch-slider',             'pitch-val',             100],
        ['intonation-slider',        'intonation-val',        100],
        ['guild-speed-slider',       'guild-speed-val',       100],
        ['guild-pitch-slider',       'guild-pitch-val',       100],
        ['guild-intonation-slider',  'guild-intonation-val',  100],
        ['guild-volume-slider',      'guild-volume-val',      100],
    ].forEach(([id, vid, div]) => {
        const s = document.getElementById(id);
        const v = document.getElementById(vid);
        if (s && v) s.addEventListener('input', () => {
            v.textContent = (s.value / div).toFixed(2);
        });
    });
}

// ---- スピーカーセレクト ----

function initSpeakerSelects() {
    document.getElementById('speaker-select')?.addEventListener('change', e => {
        window.ReadFeature.user.selectedSpeakerUuid = e.target.value;
        window.ReadFeature.renderUserStyles(null);
    });
    document.getElementById('guild-speaker-select')?.addEventListener('change', e => {
        window.ReadFeature.guild.selectedSpeakerUuid = e.target.value;
        window.ReadFeature.renderGuildStyles(null);
    });
}

// ---- おみくじアニメーション ----

function startOmikujiAnimation() {
    const steps = ['omikuji-step-1', 'omikuji-step-2', 'omikuji-step-3'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('visible', 'done');
    });
    steps.forEach((id, i) => {
        setTimeout(() => {
            if (i > 0) {
                document.getElementById(steps[i - 1])?.classList.remove('visible');
                document.getElementById(steps[i - 1])?.classList.add('done');
            }
            document.getElementById(id)?.classList.add('visible');
        }, i * 1800);
    });
}

// ---- 起動 ----

async function main() {
    initTabs();
    initSliders();

    await window.SpeakerStore.load();

    const first = window.SpeakerStore.list[0]?.speaker_uuid ?? null;
    window.ReadFeature.user.selectedSpeakerUuid  = first;
    window.ReadFeature.guild.selectedSpeakerUuid = first;
    window.ReadFeature.renderUserStyles(null);
    window.ReadFeature.renderGuildStyles(null);

    initSpeakerSelects();

    const isEmbedded = new URLSearchParams(window.location.search).has('frame_id');
    if (isEmbedded) {
        await initSDK();
    } else {
        // テストモード: ダミーユーザーIDで認証ゲートを開放
        window.App.userId  = 'test-user';
        window.App.guildId = 'test-guild';
        document.getElementById('greeting-text').textContent = 'テストモード';
        navigate('top');
        revealAuthGates();
    }

    // ---- 画面遷移 ----
    document.querySelectorAll('[data-screen]').forEach(el =>
        el.addEventListener('click', () => {
            if (el.classList.contains('menu-card-disabled')) return;
            navigate(el.getAttribute('data-screen'));
        })
    );

    // ---- 即時アクション ----
    document.querySelectorAll('[data-action]').forEach(el => {
        el.addEventListener('click', () => {
            const a = el.getAttribute('data-action');
            if (a === 'read-start') window.ReadFeature.start();
            if (a === 'read-end')   window.ReadFeature.end();
        });
    });

    // ---- FAQ ----
    document.querySelectorAll('[data-faq-category]').forEach(el => {
        el.addEventListener('click', () => {
            window.FaqFeature.renderCategory(el.getAttribute('data-faq-category'));
        });
    });
    document.getElementById('faq-answer-back')?.addEventListener('click', () => {
        const catId = document.getElementById('faq-answer-back').getAttribute('data-category');
        if (catId) window.FaqFeature.renderCategory(catId);
        else navigate('faq-detail');
    });

    // ---- おみくじ ----
    document.getElementById('omikuji-draw-btn')?.addEventListener('click', () => {
        startOmikujiAnimation();
        window.OmikujiFeature.draw();
    });

    // ---- 保存ボタン ----
    document.getElementById('save-speaker-btn')          ?.addEventListener('click', () => window.ReadFeature.saveUserSpeaker());
    document.getElementById('save-param-btn')             ?.addEventListener('click', () => window.ReadFeature.saveUserParam());
    document.getElementById('save-guild-speaker-btn')     ?.addEventListener('click', () => window.ReadFeature.saveGuildSpeaker());
    document.getElementById('save-guild-param-btn')       ?.addEventListener('click', () => window.ReadFeature.saveGuildParam());
    document.getElementById('dict-add-btn')               ?.addEventListener('click', () => window.ReadFeature.dictAdd());
    document.getElementById('dict-del-btn')               ?.addEventListener('click', () => window.ReadFeature.dictDel());

    // 記憶の塔
    document.getElementById('tower-start-btn')?.addEventListener('click', () => window.TowerFeature.start());
    document.getElementById('tower-exit-btn')?.addEventListener('click', () => window.TowerFeature.exit());
    document.getElementById('tower-descend-btn')?.addEventListener('click', () => window.TowerFeature.descend());
    document.querySelectorAll('.tower-dpad-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dx = parseInt(btn.getAttribute('data-dx'));
            const dy = parseInt(btn.getAttribute('data-dy'));
            window.TowerFeature.move(dx, dy);
        });
    });
    document.getElementById('tower-remnant-give-btn')?.addEventListener('click', () => window.TowerFeature.rescueWithItem());
    document.getElementById('tower-remnant-free-btn')?.addEventListener('click', () => window.TowerFeature.rescueFree());
    document.getElementById('tower-remnant-skip-btn')?.addEventListener('click', () => window.TowerFeature.skipRescue());
    document.getElementById('tower-remnant-record-btn')?.addEventListener('click', () => window.TowerFeature.recordRemnant());
    document.getElementById('tower-abandon-btn')?.addEventListener('click', () => window.TowerFeature.abandonRun());
    document.getElementById('tower-cleared-back-btn')?.addEventListener('click', () => {
        navigate('tower');
        window.TowerFeature.checkAndShowTop();
    });

    // 記憶の塔: 確認ダイアログ
    document.getElementById('tower-confirm-cancel-btn')?.addEventListener('click', () => window.TowerFeature.closeUnidentifiedConfirm());
    document.getElementById('tower-confirm-use-btn')?.addEventListener('click', () => window.TowerFeature.confirmUseUnidentified());
    document.getElementById('tower-rescue-override-cancel-btn')?.addEventListener('click', () => window.TowerFeature.closeRescueOverrideConfirm());
    document.getElementById('tower-rescue-override-confirm-btn')?.addEventListener('click', () => window.TowerFeature.confirmRescueOverride());
    document.getElementById('tower-minimap-btn')?.addEventListener('click', () => window.TowerFeature.showMinimap());
    document.getElementById('tower-minimap-close-btn')?.addEventListener('click', () => window.TowerFeature.closeMinimap());

    // プレビューボタンはdocumentへの委譲で拾う（動的生成・cloneNode対応）
    document.addEventListener('click', (e) => {
        const id = e.target.id || e.target.closest('[id]')?.id;
        if (id === 'speaker-preview-play-btn')        window.ReadFeature.playVoiceSample();
        if (id === 'guild-speaker-preview-play-btn')  window.ReadFeature.playGuildVoiceSample();
    });
}

main();
