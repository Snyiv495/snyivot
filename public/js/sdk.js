/*****************
    sdk.js
    Discord SDK初期化
*****************/

async function initSDK() {
    const SDKClass = (window.DiscordActivitySDK && window.DiscordActivitySDK.DiscordSDK)
        ? window.DiscordActivitySDK.DiscordSDK
        : null;

    if (!SDKClass) {
        navigate('top');
        return;
    }

    const globalTimeout = setTimeout(() => {
        navigate('top');
    }, 20000);

    try {
        const sdk = new SDKClass("1115961407410819123");

        await Promise.race([
            sdk.ready(),
            new Promise((_, r) => setTimeout(() => r(new Error('ready timeout')), 10000))
        ]);

        const { code } = await sdk.commands.authorize({
            client_id: "1115961407410819123",
            response_type: 'code',
            state: '',
            prompt: 'none',
            scope: ['identify', 'guilds'],
        });

        const tokenRes = await fetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        if (!tokenRes.ok) throw new Error('token ' + tokenRes.status);
        const { access_token } = await tokenRes.json();

        const auth = await sdk.commands.authenticate({ access_token });

        window.App.userId    = auth.user.id;
        window.App.guildId   = sdk.guildId;
        window.App.channelId = sdk.channelId;

        const el = document.getElementById('greeting-text');
        if (el) el.textContent = 'こんにちは、' + auth.user.username + 'さん';

    } catch (e) {
        console.error('[SDK]', e.message);
    } finally {
        clearTimeout(globalTimeout);
        navigate('top');
    }
}
