# 依存関係抽出ツール仕様書

## 1. 概要

Gitリポジトリ内からJava、PHP、Node.jsのプロジェクトを検出し、それらが使用している依存関係ライブラリを抽出するツール。
本ツールはDockerコンテナとして動作することを想定する。

## 2. 目的

- SBOM (Software Bill of Materials) の自動生成支援
- チーム内で利用が禁止されているライブラリが使用されていないかのチェック
- 脆弱性のあるバージョンのライブラリが使用されていないかの検出

## 3. 入力

- Dockerコンテナ実行時の引数として、スキャン対象のGitリポジトリがクローンされたホストOS上のディレクトリパスを受け取る。
  - 例: `/path/to/cloned_repository`

## 4. 処理フロー

1.  **プロジェクト検出**:
    *   指定されたディレクトリパス配下を再帰的にスキャンし、以下のプロジェクト定義ファイルを探す。この際、`dependency-extractor\\sample\\Dirwalk.js` の処理を参考に、シンボリックリンクを無視し、非同期で効率的にファイルを探索する。
        *   Java (Maven): `pom.xml`
        *   Java (Gradle): `build.gradle` または `build.gradle.kts`
        *   PHP (Composer): `composer.json`
        *   Node.js: `package.json`
2.  **依存関係抽出**:
    *   検出された各プロジェクトファイルに対して、以下の方法で依存関係情報を抽出する。
    *   **Java (Maven)**:
        1.  `pom.xml` があるディレクトリで `mvn help:effective-pom -Doutput=effective-pom.xml` コマンドを実行する。
            *   注意: `mvn` コマンドがコンテナ内にインストールされている必要がある。
        2.  生成された `effective-pom.xml` をパースし、`<dependencies>` タグ内の情報を抽出する。
            *   `<groupId>`, `<artifactId>`, `<version>` を取得する。
    *   **Java (Gradle)**:
        1.  `build.gradle` または `build.gradle.kts` があるディレクトリで `gradle dependencies` コマンドを実行する。
            *   注意: `gradle` コマンドがコンテナ内にインストールされている必要がある。
        2.  コマンドの標準出力をパースし、依存関係の情報を抽出する。
            *   `group:name:version` の形式で出力される情報を解析する。
    *   **PHP (Composer)**:
        1.  `composer.json` があるディレクトリで `composer show --all --format=json` コマンドを実行する。
            *   注意: `composer` コマンドがコンテナ内にインストールされている必要がある。
        2.  コマンドの標準出力 (JSON形式) をパースし、`installed` 配列内の各ライブラリの `name` と `version` を抽出する。
    *   **Node.js (npm/yarn)**:
        1.  `package.json` があるディレクトリで、まず `package-lock.json` (npm) または `yarn.lock` (Yarn) の存在を確認する。
        2.  ロックファイルが存在する場合:
            *   `package-lock.json`: `dependencies` プロパティ配下の情報をパースする。
            *   `yarn.lock`: 専用のパーサーを利用するか、簡易的なテキスト解析で情報を抽出する。
        3.  ロックファイルが存在しない場合:
            *   `package.json` をパースし、`dependencies` および `devDependencies` プロパティ配下の情報を抽出する。
            *   バージョンが範囲指定 (`^1.0.0`, `~2.2.x`など) や `latest`、`next` などのタグ指定の場合、その指定文字列をそのままバージョンとして記録する。ビルドやインストールを伴うバージョン解決は行わない。
    *   **依存関係の再帰的抽出について**:
        *   Maven (`effective-pom`)、Gradle (`dependencies`タスク)、Composer (`composer show --all`) は、実行時点で間接的な依存関係も解決してリストアップするため、その結果をそのまま利用する。
        *   Node.js のロックファイルも同様に、間接的な依存関係を含むため、それをパースする。
        *   `package.json` のみをパースする場合は、直接的な依存関係のみが対象となる。
3.  **情報整形と出力**:
    *   抽出した情報を以下のCSV形式で整形する。
    *   出力ファイル名: `dependencies.csv` (ツール実行ディレクトリ直下に生成)
    *   CSVヘッダー: `ProjectType`, `ProjectPath`, `DependencyName`, `DependencyVersion`
        *   `ProjectType`: `Maven`, `Gradle`, `Composer`, `NPM` のいずれか。
        *   `ProjectPath`: リポジトリルートからのプロジェクト定義ファイルへの相対パス (例: `my-java-app/pom.xml`)。
        *   `DependencyName`: ライブラリ名 (例: `org.apache.commons:commons-lang3`, `lodash`)。
        *   `DependencyVersion`: ライブラリのバージョン (例: `3.12.0`, `^4.17.21`)。

## 5. Dockerコンテナ化

1.  **ベースイメージ**:
    *   `node:18-alpine` (または最新のLTS Alpine版) を推奨。
    *   これに加えて、Java (JDK + Maven, Gradle)、PHP (PHP + Composer) の実行環境をインストールする必要がある。
    *   マルチステージビルドを利用して、各言語の環境構築レイヤーとアプリケーションレイヤーを分離することを検討する。
    *   あるいは、各言語の公式イメージに必要なツールを追加インストールしたカスタムイメージを事前に用意することも考えられる。
2.  **Dockerfile構成案 (マルチステージビルド例)**:

    ```dockerfile
    # Stage 1: Java tools
    FROM maven:3.8-openjdk-11 AS java_builder
    # Gradleも必要ならここに追加

    # Stage 2: PHP tools
    FROM composer:latest AS php_builder

    # Stage 3: Node.js application
    FROM node:18-alpine

    # 必要なツールを前のステージからコピー
    # COPY --from=java_builder /usr/bin/mvn /usr/bin/mvn # パスは適宜調整
    # COPY --from=java_builder /usr/share/maven /usr/share/maven # パスは適宜調整
    # COPY --from=php_builder /usr/bin/composer /usr/bin/composer # パスは適宜調整

    WORKDIR /app

    # アプリケーションコードをコピー
    COPY package.json ./
    COPY package-lock.json ./ # もしあれば
    RUN npm ci --only=production # 開発依存は含めない

    COPY src ./src

    # 依存関係抽出に必要なコマンドをインストール (Dockerfile内で)
    # RUN apk add --no-cache openjdk11 maven gradle php composer # 例: Alpineの場合

    # コンテナ実行時のデフォルトコマンド
    # ENTRYPOINT ["node", "src/main.js"]
    ```
    *   上記Dockerfileはあくまで構成案であり、実際に必要なツールやインストール方法は詳細設計で詰める。
    *   `mvn`, `gradle`, `composer` コマンドをNode.js環境から実行できるようにパスを通すか、フルパスで指定する必要がある。
3.  **コンテナ実行コマンド例**:
    ```bash
    docker build -t dependency-extractor .
    docker run --rm -v /path/to/host/repo:/mnt/repo dependency-extractor /mnt/repo
    ```
    *   `/path/to/host/repo` はホスト上のリポジトリパス。
    *   `/mnt/repo` はコンテナ内のマウントポイント。
    *   実行後、ホストの `/path/to/host/repo` (またはコンテナ実行時のカレントディレクトリなど、出力先として指定した場所) に `dependencies.csv` が生成される。

## 6. 使用技術

-   **プログラミング言語**: Node.js (v18.20.7推奨、ESM構文を使用)
-   **主要ライブラリ (Node.js)**:
    *   ファイルシステム操作: Node.js標準の `fs` モジュール (非同期版 `fs/promises` を推奨)
    *   パス操作: Node.js標準の `path` モジュール
    *   コマンド実行: Node.js標準の `child_process` モジュール (`execFile` や `spawn` を推奨)
    *   XMLパーサー: `fast-xml-parser` などを検討 (pom.xml用)
    *   CSV生成: `csv-stringify` などを検討
    *   引数解析: `commander` (CLIツールとして直接実行する場合。DockerコンテナのENTRYPOINTで引数を渡す場合は必須ではない)
-   **外部コマンド**:
    *   `mvn` (Maven)
    *   `gradle` (Gradle)
    *   `composer` (PHP Composer)

## 7. 制限事項・考慮事項

-   **実行環境の前提**:
    *   ツールを実行するDockerコンテナ内には、Node.js、Java (JDK)、Maven、Gradle、PHP、Composer が適切にインストールされ、パスが通っている必要がある。
-   **プロジェクトファイルのエンコーディング**: UTF-8を前提とする。
-   **巨大なリポジトリ**: スキャンに時間がかかる可能性がある。パフォーマンスについては初期リリースでは主要機能の実装を優先し、必要に応じて改善する。
-   **シンボリックリンク**: プロジェクトファイル検索時にシンボリックリンクを追跡するかどうかは、Node.jsの `fs.readdir` の `withFileTypes` オプションや `fs.stat` で判定し、適切に処理する。基本的には追跡しない方向で検討。
-   **エラーハンドリング**:
    *   プロジェクト定義ファイルのパースエラーや、外部コマンドの実行エラーが発生した場合、該当プロジェクトの処理はスキップし、エラー情報を標準エラー出力にログとして記録する。処理全体は可能な限り続行する。
    *   ログメッセージは日本語で表記する。
-   **複数プロジェクトの混在**:
    *   リポジトリ内に複数のプロジェクト (例: JavaプロジェクトとNode.jsプロジェクトが同居) が存在する場合、それぞれを個別のプロジェクトとして認識し、依存関係を抽出する。
-   **依存関係のバージョン情報**:
    *   `pom.xml` や `build.gradle`、`composer.json`、`package.json` に記述されているバージョン情報をそのまま取得する。
    *   `latest`、`*`、`^1.0.0`、`~2.2.x` のような範囲指定やタグ指定の場合、解決せずにその記述をそのままバージョンとして記録する。
    *   ロックファイル (`package-lock.json`, `yarn.lock`) が存在する場合は、そこに記録されている解決済みのバージョンを優先する。
-   **セキュリティ**:
    *   外部コマンド実行時のコマンドインジェクション対策として、ユーザー入力を直接シェルコマンドに埋め込まないように注意する (`child_process.execFile` や `spawn` を適切に使用する)。
-   **テスト**:
    *   ユニットテスト: 各パーサーや主要な処理ロジックに対してJestでテストを作成する。
    *   結合テスト: サンプルリポジトリ (各言語のプロジェクトを含む) を用意し、ツール全体を実行して期待通りのCSVが出力されるかを確認する。

## 8. フォルダ構成 (ツール自体の開発)

```
.
├── Dockerfile
├── src/
│   ├── index.js         # メイン処理
│   ├── detectors/      # 各プロジェクトタイプ検出ロジック
│   │   ├── javaDetector.js
│   │   ├── phpDetector.js
│   │   └── nodeDetector.js
│   ├── extractors/     # 各プロジェクトタイプ依存関係抽出ロジック
│   │   ├── mavenExtractor.js
│   │   ├── gradleExtractor.js
│   │   ├── composerExtractor.js
│   │   └── npmExtractor.js
│   └── utils/          # ユーティリティ関数 (ファイル操作、CSV生成など)
│       └── csvHelper.js
├── test/
│   ├── unit/
│   └── integration/
│       └── fixtures/   # テスト用サンプルリポジトリ
├── package.json
├── README.md
└── doc/
    └── spec.md
```

## 9. 今後の拡張可能性

-   対応言語・プロジェクトタイプの追加 (Python/pip, Ruby/gemなど)
-   出力形式の追加 (JSONなど)
-   脆弱性データベースとの連携
-   ライセンス情報抽出機能
