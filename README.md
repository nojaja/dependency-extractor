# 依存関係抽出ツール

Gitリポジトリ内からJava（Maven/Gradle）、PHP（Composer）、Node.js（npm/yarn）のプロジェクトを検出し、それらが使用している依存関係ライブラリを抽出するツール。

## 概要

このツールはSBOM（Software Bill of Materials）の自動生成支援や、チーム内で使用が禁止されているライブラリのチェック、脆弱性のあるバージョンのライブラリが使用されていないかの検出などに役立ちます。

対応しているプロジェクト形式：
- Java Maven プロジェクト（pom.xml）
- Java Gradle プロジェクト（build.gradle）
- PHP Composer プロジェクト（composer.json）
- Node.js プロジェクト（package.json）

## 使用方法

### Dockerを使用する場合（推奨）

1. イメージをビルドする
   ```bash
   docker build -t dependency-extractor .
   ```

2. 抽出を実行する
   ```bash
   docker run --rm -v /path/to/your/repo:/mnt/repo dependency-extractor
   ```

   または、出力ファイル名を指定する場合：
   ```bash
   docker run --rm -v /path/to/your/repo:/mnt/repo -v $(pwd):/output dependency-extractor /mnt/repo -o /output/result.csv
   ```

### 直接実行する場合

前提条件：
- Node.js 18以上
- Java（JDK 11以上）
- Maven
- Gradle
- PHP
- Composer

1. 依存関係をインストール
   ```bash
   npm install
   ```

2. 実行する
   ```bash
   node src/index.js /path/to/your/repo
   ```

   オプション:
   - `-o, --output <path>`: 出力CSVファイルのパスを指定（デフォルト: `dependencies.csv`）
   - `-d, --debug`: デバッグモードを有効化

## 出力形式

ツールは以下のCSV形式で依存関係情報を出力します：

```csv
ProjectType,ProjectPath,DependencyName,DependencyVersion
Maven,my-app/pom.xml,org.apache.commons:commons-lang3,3.12.0
NPM,web-frontend/package.json,lodash,4.17.21
```

- `ProjectType`: プロジェクトの種類（Maven, Gradle, Composer, NPM）
- `ProjectPath`: リポジトリルートからのプロジェクト定義ファイルへの相対パス
- `DependencyName`: 依存ライブラリ名
- `DependencyVersion`: 依存ライブラリのバージョン

## 開発

### フォルダ構成

```
.
├── Dockerfile
├── src/
│   ├── index.js             # メイン処理
│   ├── detectors/           # プロジェクト検出ロジック
│   │   └── projectDetector.js
│   ├── extractors/          # 依存関係抽出ロジック
│   │   ├── mavenExtractor.js
│   │   ├── gradleExtractor.js
│   │   ├── composerExtractor.js
│   │   └── npmExtractor.js
│   └── utils/               # ユーティリティ関数
│       ├── dirWalker.js     # ディレクトリ走査
│       └── csvHelper.js     # CSV出力
├── test/                    # テストコード
├── package.json
└── README.md
```

### テスト実行

```bash
npm test
```

## ライセンス

MIT
