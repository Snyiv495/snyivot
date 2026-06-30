/*****************
    navigate.js
    画面遷移
*****************/

// 認証が必要な画面の gate/content ペア
const AUTH_GATES = {
    'read-dict-add': ['dict-add-auth-gate', 'dict-add-content'],
    'read-dict-del': ['dict-del-auth-gate', 'dict-del-content'],
    'read-user':     ['user-auth-gate',     'user-content'],
    'read-guild':    ['guild-auth-gate',     'guild-content'],
    'omikuji':       ['omikuji-auth-gate',  'omikuji-top-content'],
    'tower':         ['tower-auth-gate',    'tower-top-content'],
};

function navigate(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('screen-' + screen);
    if (!target) return;
    target.classList.add('active');

    if (AUTH_GATES[screen]) {
        const [gId, cId] = AUTH_GATES[screen];
        const authed = !!window.App?.userId;
        document.getElementById(gId).style.display = authed ? 'none' : 'flex';
        document.getElementById(cId).style.display = authed ? 'block' : 'none';
    }

    if (screen === 'read-user'  && window.App?.userId) window.ReadFeature.loadUserSetting();
    if (screen === 'read-guild' && window.App?.userId) window.ReadFeature.loadGuildSetting();
    if (screen === 'tower'      && window.App?.userId) window.TowerFeature.checkAndShowTop();
}

function revealAuthGates() {
    Object.entries(AUTH_GATES).forEach(([screen, [gId, cId]]) => {
        const s = document.getElementById('screen-' + screen);
        if (s?.classList.contains('active')) {
            document.getElementById(gId).style.display = 'none';
            document.getElementById(cId).style.display = 'block';
        }
    });
}
