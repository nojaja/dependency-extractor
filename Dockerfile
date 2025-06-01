# Dockerfile for Dependency Extractor Tool

# Stage 1: Java tools
FROM maven:3.8-openjdk-11 AS java_builder
# Gradle 7.xをダウンロードしてインストール
RUN wget -q https://services.gradle.org/distributions/gradle-7.4.2-bin.zip -O gradle.zip \
    && unzip -q gradle.zip -d /opt \
    && ln -s /opt/gradle-7.4.2 /opt/gradle \
    && rm gradle.zip

# Stage 2: PHP tools
FROM composer:2 AS php_builder

# Stage 3: Final image based on Node.js
FROM node:18-alpine

# 必要なツールをインストール
RUN apk add --no-cache openjdk11 php git 

# Javaツール（Maven, Gradle）のコピー
COPY --from=java_builder /usr/share/maven /usr/share/maven
COPY --from=java_builder /opt/gradle /opt/gradle

# PHPツール（Composer）のコピー
COPY --from=php_builder /usr/bin/composer /usr/bin/composer

# Path設定
ENV PATH="/usr/share/maven/bin:/opt/gradle/bin:${PATH}"

# アプリケーションディレクトリの作成と作業ディレクトリの設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 本番依存関係のインストール
RUN npm ci --only=production

# アプリケーションコードをコピー
COPY src/ ./src/

# マウントポイントディレクトリの作成
RUN mkdir -p /mnt/repo

# コンテナ実行時の設定
ENTRYPOINT ["node", "src/index.js"]
CMD ["/mnt/repo"]

# ラベル情報
LABEL org.opencontainers.image.title="Dependency Extractor Tool" \
      org.opencontainers.image.description="Gitリポジトリ内からJava、PHP、Node.jsのプロジェクトを検出し、依存関係ライブラリを抽出するツール" \
      org.opencontainers.image.version="0.1.0"
