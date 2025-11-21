## YouTube 切り抜き検索ツール

配信アーカイブの URL から、その動画へリンクしている切り抜き動画を抽出し、再生数 / 投稿日 / 動画長でソートできる Web ツールです。`youtube_clip_spike` と同様に Flask ベースで構築しています。

### セットアップ

1. `.env` に `YOUTUBE_API_KEY` を設定します。
2. 依存パッケージをインストールします。

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. 開発サーバを起動します。

```bash
FLASK_APP=app flask run
```

ブラウザで `http://localhost:5000` にアクセスすると、アーカイブ URL の入力欄と結果一覧が表示されます。検索は 1 リクエストにつき最大 50 件の候補を取得し、YouTube 検索の関連度順で問い合わせた結果を元に、タブや並び替えをローカルで行えます。

### Docker / Lightsail での起動

ローカル開発は従来通り `.env` を使って実行します。

```bash
docker compose -f deploy/lightsail/docker-compose.yml up --build
```

Lightsail Container Service に配置する場合は、`config/lightsail.env.example` を `config/lightsail.env` にコピーして秘密情報を記入し、`deploy/lightsail/` 配下の Dockerfile / Compose ファイルをそのまま利用します。`.dockerignore` で `tests/` や `sample/` などローカル限定ファイルを除外しているため、同ディレクトリから `docker compose` や CI のビルドを実行すれば本番向けイメージを作成できます。
