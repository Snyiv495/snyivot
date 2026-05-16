# すにゃbotの環境構築
Android端末をサーバー化するフローを記述する
- AndroidにTermuxをインストールしてubuntu環境を構築し, そのうえでVOICEVOXとNodejsの環境を作り, すにゃbotを起動させる
- ついでにTermux-X11を利用したgnomeデスクトップ環境も作っているが, 面白そうだから作っているだけで必須ではない
- デスクトップ環境は調べたら無限に出てくるので割愛

1. [**Termux**](#1-termux)
2. [**Ubuntu**](#2-ubuntu)
3. [**VOICEVOX**](#3-voicevox)
4. [**nodejs**](#4-nodejs)
5. [**すにゃbot**](#5-すにゃbot)
6. [**起動**](#6-起動)
7. [**その他**](#その他)

## 1. [Termux](https://play.google.com/store/apps/details?id=com.termux&hl=ja&pli=1)
セットアップ(ストレージ共有, バックグラウンド起動, Termux-X11関連)
```
pkg update
termux-setup-storage
termux-wake-lock
pkg install x11-repo -y
pkg insatall termux-x11-nightly -y
nano .termux/termux.properties
```
`# allow-external-apps = true`のコメントアウト(#)を削除

[カスタムインストーラー](https://github.com/23xvx/Termux-Proot-Custom-Installer)をダウンロード
```
curl -s https://raw.githubusercontent.com/23xvx/Termux-Proot-Custom-Installer/main/wget-proot.sh >> wget-proot.sh
bash wget-proot.sh
```
`Your architecture is ...`を確認してコンティニュー\
確認したファイルを[ubuntuイメージ](https://cloud-images.ubuntu.com/releases/jammy/release/)からコピペ
```
https://cloud-images.ubuntu.com/releases/jammy/release/ubuntu-22.04-server-cloudimg-arm64-root.tar.xz
```
任意のディスク名(ex. `ubuntu`)をつけて起動
```
bash ubuntu.sh
```

## 2. Ubuntu
.bashrcファイルを作り直して再起動
```
rm .bashrc
cp /etc/skel/.bashrc .
sed -i 's/32/31/g' .bashrc
echo "export PULSE_SERVER=127.0.0.1" >> ~/.bashrc
echo 'export LANG=ja_JP.UTF-8' >> ~/.bashrc
echo 'export LANGUAGE="ja_JP:ja"' >> ~/.bashrc
exit
```
アップデートとインストール
```
apt update
apt install g++ make cmake python3 python3-pip build-essential libssl-dev libffi-dev zlib1g-dev lobbz2-dev liblzma-devgnome-shell gnome-terminal gnome-tweaks gnome-shell-extensions gnome-shell-extension-ubuntu-dock yaru-theme-gnome-shell yaru-theme-icon yaru-theme-gtk nautilus nano gedit dbus-x11 tigervnc-standalone-server language-pack-ja -y
```
ログイン時のエラーメッセージの対処\
`nano /etc/bash.bashrc`でファイルを開いて以下の箇所をすべてコメントアウト
```
# sudo hint
if
    case
    ...
    esac
fi
```

ユーザーの追加　(snyivの部分は任意のユーザー名)
```
useradd -D -s /bin/bash
useradd snyiv -m
passwd  snyiv
echo "snyiv ALL=(ALL) ALL" >> /etc/sudoers
echo "cd /home/snyiv && su snyiv" >> .bashrc
su snyiv
```
vncの設定
```
mkdir .vnc
nano .vnc/xstartup
```
xstartupに記述
```
#!/bin/bash

export XDG_CURRENT_DESKTOP="GNOME"
service dbus start
gnome-shell --x11
```
権限設定
```
chmod +x .vnc/xstartup
```

## 3. VOICEVOX
公式でarm版に対応したので[VOICEVOX公式サイト](https://voicevox.hiroshiba.jp/)からダウンロード
```
wget https://github.com/VOICEVOX/voicevox/releases/download/0.24.2/voicevox-linux-cpu-arm64-0.24.2.tar.gz
tar -zxvf voicevox-linux-cpu-arm64-0.24.2.tar.gz
```

## 4. nodejs
nvmを利用して[nodejs](https://nodejs.org/en/download/package-manager)をインストールする
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```
```
nvm install 20
```
> [!IMPORTANT]
> `nvm install`の前に再起動をしないとnvmが見つからない

## 5. すにゃbot
[すにゃbot](https://github.com/Snyiv495/Snyivot.git)をクローンしてパッケージのインストール
```
git clone https://github.com/Snyiv495/Snyivot.git
cd Snyivot
npm install
```
> [!WARNING]
> githubに.env, assets, db.sqliteはアップロードしていない\
> 適宜確認して修正すること


## 6. 起動
### VOICEVOX
```
cd VOICEVOX
vv-engine/run
```
> [!NOTE]
> ポート50021が使えない旨のエラーが出たら使えるポートを指定する\
> ex. `vv-engine/run --port 50000`

### すにゃbot
```
cd snyivot
npm start
```

## その他

### (a) gnome-desktop
Termux環境でTermux-X11を起動する
```
termux-x11 :1
```
Ubuntu環境でvncを起動する
```
export DISPLAY=:1
.vnc/xstartup
```
[Termux-X11のアプリ](https://github.com/termux/termux-x11/releases)を開くとGUI環境を確認できる.\
dockを左の1列に表示させる
```
gsettings set org.gnome.shell.extensions.dash-to-dock dock-position LEFT
```
```
gsettings set org.gnome.shell.extensions.dash-to-dock extend-height true
```
firefoxのインストール
```
sudo add-apt-repository ppa:mozillateam/ppa
```
```
echo '
Package: *
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 1001
' | tee /etc/apt/preferences.d/mozilla-firefox
```
```
apt insatll firefox -y
```

- 右クリック(2本指でタップ)して設定を開き, 任意の解像度や壁紙を設定する.
- applicationからExtensionsをいて, Ubuntu Dockをオンにする.
- applicationからUtilitiesのTweaksを開いて, AppearanceタブのThemeをYaruに変えていく.
- firefoxを起動して検索バーに`about:config`と入力
- `sandbox.cubeb`で検索し, 追加アイコンを押す
- `sandbox.`で検索し, `security.sandbox.content.level`の編集アイコンを押して, 値を0に変更する


### (b) 旧VOICEVOXの導入
公式がarm版に対応してくれたので使うことはないと思う

[python](https://www.python.org/ftp/python/)のダウンロードとビルド
```
wget https://www.python.org/ftp/python/3.11.1/Python-3.11.1.tar.xz
xz -dc Python-3.11.1.tar.xz | tar xfv -
cd Python-3.11.1
./configure
make -j8
sudo make altinstall
pip update
```
[voicevox_engine](https://github.com/VOICEVOX/voicevox_engine)のクローン
```
cd && git clone https://github.com/VOICEVOX/voicevox_engine
cd voicevox_engine && python3.11 -m pip install -r requirements.txt
```
[voicevox_engine](https://github.com/VOICEVOX/voicevox_engine/releases)と[voicevox_core](https://github.com/VOICEVOX/voicevox_core/releases/)のダウンロードと整理

```
cd && wget https://github.com/VOICEVOX/voicevox_engine/releases/download/0.20.0/voicevox_engine-linux-cpu-0.20.0.7z.001
7z x voicevox_engine-linux-cpu-0.20.0.7z.001
cp -r voicevox_engine/voicevox_engine linux-cpu/
cp voicevox_engine/run.py linux-cpu/
sudo rm -r voicevox_engine
mv linux-cpu voicevox
cd voicevox
wget https://github.com/VOICEVOX/voicevox_core/releases/download/0.15.4/download-linux-arm64
chmod +x ./download-linux-arm64 && ./download-linux-arm64
```